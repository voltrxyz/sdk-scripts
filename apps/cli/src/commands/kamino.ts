import type { Command } from "commander";
import {
  asAddress,
  findVaultStrategyAuthPda,
  parseBigintAmount,
  processOperation,
  requireAssetMint,
  requireAssetTokenProgram,
  requireKaminoKvault,
  requireKaminoReserve,
  requireVaultAddress,
  resolveLookupTableAddresses,
  type Address,
  type BuiltOperation,
  type KeyPairSigner,
  type ScriptContext,
  type ScriptProfile,
} from "@voltr/scripts-core";
import {
  buildKaminoKvaultClaimRewardsOperation,
  buildKaminoKvaultDepositOperation,
  buildKaminoKvaultInitOperation,
  buildKaminoKvaultWithdrawOperation,
  buildKaminoMarketClaimRewardOperation,
  buildKaminoMarketDepositOperation,
  buildKaminoMarketInitOperation,
  buildKaminoMarketWithdrawOperation,
  buildKaminoUserDirectWithdrawOperation,
  buildKaminoUserRequestAndDirectWithdrawOperation,
  type KaminoJupiterSwap,
} from "@voltr/scripts-kamino";
import { CliError } from "../lib/errors.js";
import { loadCommandContext, resolveProcessorOptions } from "../lib/globals.js";
import { setupKaminoRewardSwap } from "../lib/jupiter.js";
import { loadRoleSigner } from "../lib/signers.js";

// The standard SPL Token program. Most Kamino farm rewards are standard SPL
// tokens; `--reward-token-program` overrides this for Token-2022 rewards.
const DEFAULT_REWARD_TOKEN_PROGRAM =
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";

// --- flag coercion helpers ---

/** Resolve a strategy address (reserve or kvault) from the profile. */
type RequireStrategy = (
  profile: ScriptProfile,
  options?: { command?: string }
) => Address;

function parseSlippageBps(value: string): number {
  const bps = Number(value);
  if (!Number.isInteger(bps) || bps < 0 || bps > 10_000) {
    throw new CliError(
      `--slippage-bps must be an integer between 0 and 10000: ${value}`
    );
  }
  return bps;
}

function parseJupiterMaxAccounts(value: string): number {
  const maxAccounts = Number(value);
  if (!Number.isInteger(maxAccounts) || maxAccounts <= 0) {
    throw new CliError(
      `--jupiter-max-accounts must be a positive integer: ${value}`
    );
  }
  return maxAccounts;
}

function parseRewardIndex(value: string): number {
  if (!/^\d+$/.test(value)) {
    throw new CliError(
      `--reward-index must be a non-negative integer: ${value}`
    );
  }
  return Number(value);
}

// --- manager strategy operations (init / deposit / withdraw) ---

interface ManagerStrategyActionArgs {
  manager: KeyPairSigner;
  vault: Address;
  assetMint: Address;
  assetTokenProgram: Address;
  /** klend reserve (market) or kvault (kvault), resolved from the profile. */
  strategy: Address;
  /** Present only for the deposit / withdraw commands. */
  amount?: bigint;
  lookupTableAddresses: Address[];
}

interface ManagerStrategyConfig {
  command: string;
  summary: string;
  description: string;
  requireStrategy: RequireStrategy;
  /** Whether the command exposes a required `--amount` flag (deposit/withdraw). */
  needsAmount: boolean;
  build: (
    ctx: ScriptContext,
    args: ManagerStrategyActionArgs
  ) => Promise<BuiltOperation>;
}

/**
 * Register a manager-signed Kamino strategy command. `init` (no amount),
 * `deposit`, and `withdraw` for both the market and kvault domains all follow
 * the same path (validate profile → coerce flags → load manager → build →
 * process); they differ only by the strategy profile field, the builder, and
 * whether they take `--amount`.
 */
function registerManagerStrategyCommand(
  program: Command,
  config: ManagerStrategyConfig
): void {
  const command = program
    .command(config.command)
    .summary(config.summary)
    .description(config.description)
    .option(
      "--manager-keypair <path>",
      "manager keypair JSON path (or MANAGER_KEYPAIR env)"
    );
  if (config.needsAmount) {
    command.requiredOption(
      "--amount <raw>",
      "raw asset amount in smallest units"
    );
  }
  command.action(
    async (options: { managerKeypair?: string; amount?: string }) => {
      const { globals, profile, ctx } = await loadCommandContext(program);
      const vault = requireVaultAddress(profile, { command: config.command });
      const assetMint = requireAssetMint(profile);
      const assetTokenProgram = requireAssetTokenProgram(profile);
      const strategy = config.requireStrategy(profile, {
        command: config.command,
      });
      const lookupTableAddresses = resolveLookupTableAddresses(profile, {
        command: config.command,
      });
      let amount: bigint | undefined;
      if (config.needsAmount) {
        if (options.amount === undefined) {
          throw new CliError(`${config.command} requires --amount`);
        }
        amount = parseBigintAmount(options.amount);
      }
      const processorOptions = resolveProcessorOptions(globals);
      const manager = await loadRoleSigner("manager", options.managerKeypair);

      const operation = await config.build(ctx, {
        manager,
        vault,
        assetMint,
        assetTokenProgram,
        strategy,
        amount,
        lookupTableAddresses,
      });

      await processOperation({
        ctx,
        payer: manager,
        operation,
        mode: globals.mode,
        options: processorOptions,
      });
    }
  );
}

// --- manager reward claims (single resolved farm/reward, optional index) ---

interface ClaimActionArgs {
  manager: KeyPairSigner;
  vault: Address;
  assetMint: Address;
  assetTokenProgram: Address;
  strategy: Address;
  rewardMint: Address;
  rewardTokenProgram: Address;
  farmState: Address;
  userState: Address;
  rewardIndex?: number;
  jupiterSwap?: KaminoJupiterSwap;
  lookupTableAddresses: Address[];
}

interface ClaimConfig {
  command: string;
  summary: string;
  description: string;
  requireStrategy: RequireStrategy;
  /** When true, expose a required `--reward-index` (the `-with-index` variant). */
  withIndex: boolean;
  build: (
    ctx: ScriptContext,
    args: ClaimActionArgs
  ) => Promise<BuiltOperation>;
}

interface ClaimOptions {
  managerKeypair?: string;
  rewardMint: string;
  rewardTokenProgram: string;
  farmState: string;
  userState: string;
  rewardIndex?: string;
  swapAmount?: string;
  slippageBps: string;
  jupiterMaxAccounts: string;
}

/**
 * Register a manager-signed reward claim command. The builder operates on a
 * single, already-resolved farm/reward, so the operator supplies the farm and
 * reward via flags (farm discovery via the farms SDK is out of scope — see
 * docs/kamino-migration.md). The reward→asset Jupiter swap is resolved here, in
 * the CLI layer, from `--swap-amount`; it is skipped when the reward already
 * equals the asset or `--swap-amount` is omitted.
 *
 * The base (`claim-reward`) and `-with-index` variants share this registration;
 * the latter adds a required `--reward-index` that selects a specific reward
 * slot and the `*_WITH_INDEX` adaptor discriminator.
 */
function registerClaimCommand(program: Command, config: ClaimConfig): void {
  const command = program
    .command(config.command)
    .summary(config.summary)
    .description(config.description)
    .option(
      "--manager-keypair <path>",
      "manager keypair JSON path (or MANAGER_KEYPAIR env)"
    )
    .requiredOption("--reward-mint <address>", "reward token mint to claim")
    .option(
      "--reward-token-program <address>",
      "token program owning the reward mint",
      DEFAULT_REWARD_TOKEN_PROGRAM
    )
    .requiredOption(
      "--farm-state <address>",
      "farm state holding the reward (resolve via the Kamino farms SDK / UI)"
    )
    .requiredOption(
      "--user-state <address>",
      "vault-strategy user state for the farm"
    )
    .option(
      "--swap-amount <raw>",
      "raw reward amount to swap into the asset via Jupiter (omit when reward == asset)"
    )
    .option(
      "--slippage-bps <bps>",
      "max Jupiter slippage in basis points",
      "50"
    )
    .option(
      "--jupiter-max-accounts <n>",
      "max accounts to request from Jupiter",
      "18"
    );
  if (config.withIndex) {
    command.requiredOption(
      "--reward-index <n>",
      "reward slot index within the farm to claim"
    );
  }
  command.action(async (options: ClaimOptions) => {
    const { globals, profile, ctx } = await loadCommandContext(program);
    const vault = requireVaultAddress(profile, { command: config.command });
    const assetMint = requireAssetMint(profile);
    const assetTokenProgram = requireAssetTokenProgram(profile);
    const strategy = config.requireStrategy(profile, {
      command: config.command,
    });
    const lookupTableAddresses = resolveLookupTableAddresses(profile, {
      command: config.command,
    });
    const rewardMint = asAddress(options.rewardMint, "--reward-mint");
    const rewardTokenProgram = asAddress(
      options.rewardTokenProgram,
      "--reward-token-program"
    );
    const farmState = asAddress(options.farmState, "--farm-state");
    const userState = asAddress(options.userState, "--user-state");
    const rewardIndex =
      config.withIndex && options.rewardIndex !== undefined
        ? parseRewardIndex(options.rewardIndex)
        : undefined;
    const swapAmount = options.swapAmount
      ? parseBigintAmount(options.swapAmount)
      : 0n;
    const slippageBps = parseSlippageBps(options.slippageBps);
    const jupiterMaxAccounts = parseJupiterMaxAccounts(
      options.jupiterMaxAccounts
    );
    const processorOptions = resolveProcessorOptions(globals);
    const manager = await loadRoleSigner("manager", options.managerKeypair);

    // The reward lands in an ATA owned by the vault-strategy authority, which is
    // also the swap signer Jupiter builds the route for.
    const [authority] = await findVaultStrategyAuthPda({ vault, strategy });
    const jupiterSwap = await setupKaminoRewardSwap({
      rewardMint,
      assetMint,
      swapAmount,
      authority,
      slippageBps,
      maxAccounts: jupiterMaxAccounts,
    });

    const operation = await config.build(ctx, {
      manager,
      vault,
      assetMint,
      assetTokenProgram,
      strategy,
      rewardMint,
      rewardTokenProgram,
      farmState,
      userState,
      rewardIndex,
      jupiterSwap,
      lookupTableAddresses,
    });

    await processOperation({
      ctx,
      payer: manager,
      operation,
      mode: globals.mode,
      options: processorOptions,
    });
  });
}

/** Market strategies (`kamino:market:*`), backed by a klend reserve. */
function registerKaminoMarketCommands(program: Command): void {
  registerManagerStrategyCommand(program, {
    command: "kamino:market:init",
    summary: "initialize a Voltr strategy backed by a Kamino lending market",
    description:
      "Initialize a Voltr strategy backed by a klend reserve (the reserve is the strategy id). Uses integrations.kamino.reserveAddress.",
    requireStrategy: requireKaminoReserve,
    needsAmount: false,
    build: (ctx, a) =>
      buildKaminoMarketInitOperation(ctx, {
        manager: a.manager,
        vault: a.vault,
        assetMint: a.assetMint,
        assetTokenProgram: a.assetTokenProgram,
        reserve: a.strategy,
        lookupTableAddresses: a.lookupTableAddresses,
      }),
  });

  registerManagerStrategyCommand(program, {
    command: "kamino:market:deposit",
    summary: "deposit vault assets into a Kamino lending market",
    description:
      "Deposit vault assets into a Kamino lending market (klend reserve) via the Voltr Kamino adaptor.",
    requireStrategy: requireKaminoReserve,
    needsAmount: true,
    build: (ctx, a) =>
      buildKaminoMarketDepositOperation(ctx, {
        manager: a.manager,
        vault: a.vault,
        assetMint: a.assetMint,
        assetTokenProgram: a.assetTokenProgram,
        reserve: a.strategy,
        amount: a.amount!,
        lookupTableAddresses: a.lookupTableAddresses,
      }),
  });

  registerManagerStrategyCommand(program, {
    command: "kamino:market:withdraw",
    summary: "withdraw vault assets from a Kamino lending market",
    description:
      "Withdraw vault assets from a Kamino lending market (klend reserve). Pass a very large --amount to withdraw the entire position.",
    requireStrategy: requireKaminoReserve,
    needsAmount: true,
    build: (ctx, a) =>
      buildKaminoMarketWithdrawOperation(ctx, {
        manager: a.manager,
        vault: a.vault,
        assetMint: a.assetMint,
        assetTokenProgram: a.assetTokenProgram,
        reserve: a.strategy,
        amount: a.amount!,
        lookupTableAddresses: a.lookupTableAddresses,
      }),
  });

  const marketClaimBuild = (ctx: ScriptContext, a: ClaimActionArgs) =>
    buildKaminoMarketClaimRewardOperation(ctx, {
      manager: a.manager,
      vault: a.vault,
      assetMint: a.assetMint,
      assetTokenProgram: a.assetTokenProgram,
      reserve: a.strategy,
      rewardMint: a.rewardMint,
      rewardTokenProgram: a.rewardTokenProgram,
      farmState: a.farmState,
      userState: a.userState,
      rewardIndex: a.rewardIndex,
      jupiterSwap: a.jupiterSwap,
      lookupTableAddresses: a.lookupTableAddresses,
    });

  registerClaimCommand(program, {
    command: "kamino:market:claim-reward",
    summary: "claim a Kamino market farm reward into the vault asset",
    description:
      "Claim the first (non-indexed) reward from a klend reserve farm, swapping it into the vault asset via Jupiter when it differs from the asset.",
    requireStrategy: requireKaminoReserve,
    withIndex: false,
    build: marketClaimBuild,
  });

  registerClaimCommand(program, {
    command: "kamino:market:claim-reward-with-index",
    summary: "claim a specific Kamino market farm reward slot",
    description:
      "Claim a specific reward slot (--reward-index) from a klend reserve farm, swapping it into the vault asset via Jupiter when it differs from the asset.",
    requireStrategy: requireKaminoReserve,
    withIndex: true,
    build: marketClaimBuild,
  });
}

/** Kvault strategies (`kamino:kvault:*`), backed by a Kamino vault. */
function registerKaminoKvaultCommands(program: Command): void {
  registerManagerStrategyCommand(program, {
    command: "kamino:kvault:init",
    summary: "initialize a Voltr strategy backed by a Kamino vault",
    description:
      "Initialize a Voltr strategy backed by a Kamino vault (the kvault is the strategy id). Uses integrations.kamino.kvaultAddress.",
    requireStrategy: requireKaminoKvault,
    needsAmount: false,
    build: (ctx, a) =>
      buildKaminoKvaultInitOperation(ctx, {
        manager: a.manager,
        vault: a.vault,
        assetMint: a.assetMint,
        assetTokenProgram: a.assetTokenProgram,
        kvault: a.strategy,
        lookupTableAddresses: a.lookupTableAddresses,
      }),
  });

  registerManagerStrategyCommand(program, {
    command: "kamino:kvault:deposit",
    summary: "deposit vault assets into a Kamino vault",
    description:
      "Deposit vault assets into a Kamino vault (kvault) via the Voltr Kamino adaptor.",
    requireStrategy: requireKaminoKvault,
    needsAmount: true,
    build: (ctx, a) =>
      buildKaminoKvaultDepositOperation(ctx, {
        manager: a.manager,
        vault: a.vault,
        assetMint: a.assetMint,
        assetTokenProgram: a.assetTokenProgram,
        kvault: a.strategy,
        amount: a.amount!,
        lookupTableAddresses: a.lookupTableAddresses,
      }),
  });

  registerManagerStrategyCommand(program, {
    command: "kamino:kvault:withdraw",
    summary: "withdraw vault assets from a Kamino vault",
    description:
      "Withdraw vault assets from a Kamino vault (kvault). Pass a very large --amount to withdraw the entire position.",
    requireStrategy: requireKaminoKvault,
    needsAmount: true,
    build: (ctx, a) =>
      buildKaminoKvaultWithdrawOperation(ctx, {
        manager: a.manager,
        vault: a.vault,
        assetMint: a.assetMint,
        assetTokenProgram: a.assetTokenProgram,
        kvault: a.strategy,
        amount: a.amount!,
        lookupTableAddresses: a.lookupTableAddresses,
      }),
  });

  const kvaultClaimBuild = (ctx: ScriptContext, a: ClaimActionArgs) =>
    buildKaminoKvaultClaimRewardsOperation(ctx, {
      manager: a.manager,
      vault: a.vault,
      assetMint: a.assetMint,
      assetTokenProgram: a.assetTokenProgram,
      kvault: a.strategy,
      rewardMint: a.rewardMint,
      rewardTokenProgram: a.rewardTokenProgram,
      farmState: a.farmState,
      userState: a.userState,
      rewardIndex: a.rewardIndex,
      jupiterSwap: a.jupiterSwap,
      lookupTableAddresses: a.lookupTableAddresses,
    });

  registerClaimCommand(program, {
    command: "kamino:kvault:claim-rewards",
    summary: "claim a Kamino vault farm reward into the vault asset",
    description:
      "Claim the first (non-indexed) reward from a Kamino vault farm, swapping it into the vault asset via Jupiter when it differs from the asset.",
    requireStrategy: requireKaminoKvault,
    withIndex: false,
    build: kvaultClaimBuild,
  });

  registerClaimCommand(program, {
    command: "kamino:kvault:claim-rewards-with-index",
    summary: "claim a specific Kamino vault farm reward slot",
    description:
      "Claim a specific reward slot (--reward-index) from a Kamino vault farm, swapping it into the vault asset via Jupiter when it differs from the asset.",
    requireStrategy: requireKaminoKvault,
    withIndex: true,
    build: kvaultClaimBuild,
  });
}

/**
 * User direct-withdraw flows (`kamino:user:*`). A vault user withdraws their
 * share directly from the Kamino vault (kvault) strategy. These use the command
 * names that match the builders' `label` fields (the architecture mandates
 * command name == builder label); the VOL-228 ticket's suggested
 * `kamino:strategy:*` names are documented in docs/kamino-migration.md.
 */
function registerKaminoUserCommands(program: Command): void {
  program
    .command("kamino:user:direct-withdraw")
    .summary("directly withdraw a user's share of a Kamino vault strategy")
    .description(
      "Directly withdraw the user's share of a Kamino vault (kvault) strategy. Uses integrations.kamino.kvaultAddress."
    )
    .option(
      "--user-keypair <path>",
      "user keypair JSON path (or USER_KEYPAIR env)"
    )
    .action(async (options: { userKeypair?: string }) => {
      const command = "kamino:user:direct-withdraw";

      const { globals, profile, ctx } = await loadCommandContext(program);
      const vault = requireVaultAddress(profile, { command });
      const assetMint = requireAssetMint(profile);
      const assetTokenProgram = requireAssetTokenProgram(profile);
      const kvault = requireKaminoKvault(profile, { command });
      const lookupTableAddresses = resolveLookupTableAddresses(profile, {
        command,
      });
      const processorOptions = resolveProcessorOptions(globals);
      const user = await loadRoleSigner("user", options.userKeypair);

      const operation = await buildKaminoUserDirectWithdrawOperation(ctx, {
        user,
        vault,
        assetMint,
        assetTokenProgram,
        kvault,
        lookupTableAddresses,
      });

      await processOperation({
        ctx,
        payer: user,
        operation,
        mode: globals.mode,
        options: processorOptions,
      });
    });

  program
    .command("kamino:user:request-and-direct-withdraw")
    .summary(
      "request a vault withdrawal and direct-withdraw from a Kamino vault in one tx"
    )
    .description(
      "Request a vault withdrawal and directly withdraw from the Kamino vault (kvault) strategy in a single transaction."
    )
    .option(
      "--user-keypair <path>",
      "user keypair JSON path (or USER_KEYPAIR env)"
    )
    .requiredOption(
      "--amount <raw>",
      "raw amount to request (LP units when --in-lp)"
    )
    .option("--in-lp", "interpret --amount as LP tokens instead of asset units")
    .option("--all", "withdraw the entire position (overrides --amount)")
    .action(
      async (options: {
        userKeypair?: string;
        amount: string;
        inLp?: boolean;
        all?: boolean;
      }) => {
        const command = "kamino:user:request-and-direct-withdraw";

        const { globals, profile, ctx } = await loadCommandContext(program);
        const vault = requireVaultAddress(profile, { command });
        const assetMint = requireAssetMint(profile);
        const assetTokenProgram = requireAssetTokenProgram(profile);
        const kvault = requireKaminoKvault(profile, { command });
        const lookupTableAddresses = resolveLookupTableAddresses(profile, {
          command,
        });
        const withdrawAmount = parseBigintAmount(options.amount);
        const processorOptions = resolveProcessorOptions(globals);
        const user = await loadRoleSigner("user", options.userKeypair);

        const operation = await buildKaminoUserRequestAndDirectWithdrawOperation(
          ctx,
          {
            user,
            vault,
            assetMint,
            assetTokenProgram,
            kvault,
            withdrawAmount,
            isAmountInLp: Boolean(options.inLp),
            isWithdrawAll: Boolean(options.all),
            lookupTableAddresses,
          }
        );

        await processOperation({
          ctx,
          payer: user,
          operation,
          mode: globals.mode,
          options: processorOptions,
        });
      }
    );
}

/**
 * Kamino strategies (`kamino:*`). Each command follows the framework path
 * (validate profile → coerce flags → load signer → build → process). Reserve
 * and kvault addresses come from the profile (`integrations.kamino.*`);
 * per-call values (amount, reward identity, reward index, swap inputs) are
 * flags. Reward claims resolve the reward→asset Jupiter route in the CLI layer.
 */
export function registerKaminoCommands(program: Command): void {
  registerKaminoMarketCommands(program);
  registerKaminoKvaultCommands(program);
  registerKaminoUserCommands(program);
}

import type { Command } from "commander";
import {
  parseBigintAmount,
  processOperation,
  requireAssetMint,
  requireAssetTokenProgram,
  requireLookupTableAddress,
  requireSpotDirectWithdrawDiscriminator,
  requireSpotIntegration,
  requireVaultAddress,
  resolveLookupTableAddresses,
  type BuiltOperation,
  type ScriptContext,
} from "@voltr/scripts-core";
import {
  buildSpotEarnDepositOperation,
  buildSpotEarnExtendLutOperation,
  buildSpotEarnInitDirectWithdrawOperation,
  buildSpotEarnInitOperation,
  buildSpotEarnWithdrawOperation,
  buildSpotSpotBuyOperation,
  buildSpotSpotInitOperation,
  buildSpotSpotSellOperation,
  querySpotStrategyPositions,
  type SpotEarnDepositArgs,
  type SpotSpotSwapArgs,
} from "@voltr/scripts-spot";
import { CliError } from "../lib/errors.js";
import { loadCommandContext, resolveProcessorOptions } from "../lib/globals.js";
import { printJson } from "../lib/output.js";
import { loadRoleSigner } from "../lib/signers.js";

type SpotBuilder = (
  ctx: ScriptContext,
  args: SpotSpotSwapArgs
) => Promise<BuiltOperation>;

type EarnAmountBuilder = (
  ctx: ScriptContext,
  args: SpotEarnDepositArgs
) => Promise<BuiltOperation>;

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

/**
 * Register a spot swap command (`spot:spot:buy` / `spot:spot:sell`). Both sides
 * share the same flags and profile fields, so they differ only by command name
 * and builder.
 */
function registerSpotSwap(
  program: Command,
  command: "spot:spot:buy" | "spot:spot:sell",
  builder: SpotBuilder
): void {
  const side = command.endsWith("buy") ? "Buy" : "Sell";
  program
    .command(command)
    .summary(`${side.toLowerCase()} the foreign asset via spot swap`)
    .description(
      `${side} the configured foreign asset against the vault asset via a spot swap.`
    )
    .option(
      "--manager-keypair <path>",
      "manager keypair JSON path (or MANAGER_KEYPAIR env)"
    )
    .requiredOption("--amount <raw>", "raw asset amount in smallest units")
    .requiredOption("--slippage-bps <bps>", "max slippage in basis points")
    .option(
      "--jupiter-max-accounts <n>",
      "max accounts to request from Jupiter",
      "16"
    )
    .option(
      "--minimum-threshold-amount-out <raw>",
      "reject the Jupiter quote if its threshold output is below this raw amount"
    )
    .action(
      async (options: {
        managerKeypair?: string;
        amount: string;
        slippageBps: string;
        jupiterMaxAccounts: string;
        minimumThresholdAmountOut?: string;
      }) => {
        const { globals, profile, ctx } = await loadCommandContext(program);
        const vault = requireVaultAddress(profile, { command });
        const assetMint = requireAssetMint(profile);
        const assetTokenProgram = requireAssetTokenProgram(profile);
        const {
          foreignMint,
          foreignTokenProgram,
          assetOracle,
          foreignOracle,
        } = requireSpotIntegration(profile, { command });
        const lookupTableAddresses = resolveLookupTableAddresses(profile, {
          command,
        });
        const amount = parseBigintAmount(options.amount);
        const slippageBps = parseSlippageBps(options.slippageBps);
        const jupiterMaxAccounts = parseJupiterMaxAccounts(
          options.jupiterMaxAccounts
        );
        const minimumThresholdAmountOut = options.minimumThresholdAmountOut
          ? parseBigintAmount(options.minimumThresholdAmountOut)
          : undefined;
        const processorOptions = resolveProcessorOptions(globals);
        const manager = await loadRoleSigner("manager", options.managerKeypair);

        const operation = await builder(ctx, {
          manager,
          vault,
          assetMint,
          assetTokenProgram,
          foreignMint,
          foreignTokenProgram,
          assetOracle,
          foreignOracle,
          amount,
          slippageBps,
          jupiterMaxAccounts,
          minimumThresholdAmountOut,
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

/** Spot swap strategy commands (`spot:spot:*`): init + buy/sell. */
function registerSpotSwapCommands(program: Command): void {
  program
    .command("spot:spot:init")
    .summary("initialize a Spot swap strategy")
    .description(
      "Initialize a Spot strategy (its strategy id is the foreign mint): creates the strategy auth's asset and foreign token accounts and registers both Pyth oracle init receipts."
    )
    .option(
      "--manager-keypair <path>",
      "manager keypair JSON path (or MANAGER_KEYPAIR env)"
    )
    .action(async (options: { managerKeypair?: string }) => {
      const command = "spot:spot:init";

      const { globals, profile, ctx } = await loadCommandContext(program);
      const vault = requireVaultAddress(profile, { command });
      const assetMint = requireAssetMint(profile);
      const assetTokenProgram = requireAssetTokenProgram(profile);
      const { foreignMint, foreignTokenProgram, assetOracle, foreignOracle } =
        requireSpotIntegration(profile, { command });
      const lookupTableAddresses = resolveLookupTableAddresses(profile, {
        command,
      });
      const processorOptions = resolveProcessorOptions(globals);
      const manager = await loadRoleSigner("manager", options.managerKeypair);

      const operation = await buildSpotSpotInitOperation(ctx, {
        manager,
        vault,
        assetMint,
        assetTokenProgram,
        foreignMint,
        foreignTokenProgram,
        assetOracle,
        foreignOracle,
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

  registerSpotSwap(program, "spot:spot:buy", buildSpotSpotBuyOperation);
  registerSpotSwap(program, "spot:spot:sell", buildSpotSpotSellOperation);
}

/**
 * Register a Jupiter Earn amount command (`spot:earn:deposit` /
 * `spot:earn:withdraw`). Both take a single `--amount` of the vault asset and
 * share the same profile fields, differing only by command name and builder.
 */
function registerEarnAmountCommand(
  program: Command,
  command: "spot:earn:deposit" | "spot:earn:withdraw",
  builder: EarnAmountBuilder
): void {
  const isDeposit = command.endsWith("deposit");
  const verb = isDeposit ? "Deposit" : "Withdraw";
  const direction = isDeposit ? "into" : "from";
  program
    .command(command)
    .summary(`${verb.toLowerCase()} the vault asset ${direction} Jupiter Earn`)
    .description(
      `${verb} the configured vault asset ${direction} the Jupiter Earn (lending) strategy.`
    )
    .option(
      "--manager-keypair <path>",
      "manager keypair JSON path (or MANAGER_KEYPAIR env)"
    )
    .requiredOption("--amount <raw>", "raw asset amount in smallest units")
    .action(async (options: { managerKeypair?: string; amount: string }) => {
      const { globals, profile, ctx } = await loadCommandContext(program);
      const vault = requireVaultAddress(profile, { command });
      const assetMint = requireAssetMint(profile);
      const assetTokenProgram = requireAssetTokenProgram(profile);
      const lookupTableAddresses = resolveLookupTableAddresses(profile, {
        command,
      });
      const amount = parseBigintAmount(options.amount);
      const processorOptions = resolveProcessorOptions(globals);
      const manager = await loadRoleSigner("manager", options.managerKeypair);

      const operation = await builder(ctx, {
        manager,
        vault,
        assetMint,
        assetTokenProgram,
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
    });
}

/** Jupiter Earn strategy commands (`spot:earn:*`). */
function registerSpotEarnCommands(program: Command): void {
  program
    .command("spot:earn:init")
    .summary("initialize the Jupiter Earn strategy")
    .description(
      "Initialize the Jupiter Earn (lending) strategy for the vault asset: creates the strategy auth's asset and fToken token accounts. Run spot:earn:extend-lut afterwards if you use a lookup table."
    )
    .option(
      "--manager-keypair <path>",
      "manager keypair JSON path (or MANAGER_KEYPAIR env)"
    )
    .action(async (options: { managerKeypair?: string }) => {
      const command = "spot:earn:init";

      const { globals, profile, ctx } = await loadCommandContext(program);
      const vault = requireVaultAddress(profile, { command });
      const assetMint = requireAssetMint(profile);
      const assetTokenProgram = requireAssetTokenProgram(profile);
      const lookupTableAddresses = resolveLookupTableAddresses(profile, {
        command,
      });
      const processorOptions = resolveProcessorOptions(globals);
      const manager = await loadRoleSigner("manager", options.managerKeypair);

      const operation = await buildSpotEarnInitOperation(ctx, {
        manager,
        vault,
        assetMint,
        assetTokenProgram,
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

  registerEarnAmountCommand(
    program,
    "spot:earn:deposit",
    buildSpotEarnDepositOperation
  );
  registerEarnAmountCommand(
    program,
    "spot:earn:withdraw",
    buildSpotEarnWithdrawOperation
  );

  program
    .command("spot:earn:extend-lut")
    .summary("extend the lookup table with the Jupiter Earn strategy accounts")
    .description(
      "Extend the profile's lookup table (vault.lookupTableAddress) with every account the Jupiter Earn init/deposit/withdraw transactions touch, so they fit within transaction size limits. Already-present addresses are skipped. Ports the optional second transaction of the legacy earn-init flow; the manager is the lookup table authority and payer."
    )
    .option(
      "--manager-keypair <path>",
      "manager keypair JSON path (or MANAGER_KEYPAIR env)"
    )
    .action(async (options: { managerKeypair?: string }) => {
      const command = "spot:earn:extend-lut";

      const { globals, profile, ctx } = await loadCommandContext(program);
      const vault = requireVaultAddress(profile, { command });
      const assetMint = requireAssetMint(profile);
      const assetTokenProgram = requireAssetTokenProgram(profile);
      const lookupTable = requireLookupTableAddress(profile, { command });
      const processorOptions = resolveProcessorOptions(globals);
      const manager = await loadRoleSigner("manager", options.managerKeypair);

      const operation = await buildSpotEarnExtendLutOperation(ctx, {
        manager,
        vault,
        assetMint,
        assetTokenProgram,
        lookupTable,
      });

      await processOperation({
        ctx,
        payer: manager,
        operation,
        mode: globals.mode,
        options: processorOptions,
      });
    });

  program
    .command("spot:earn:init-direct-withdraw")
    .summary("register Jupiter Earn as a vault direct-withdraw strategy")
    .description(
      "Register the Jupiter Earn (lending) strategy as a direct-withdraw strategy on the vault. The strategy (the Jupiter lending PDA) and the Spot adaptor program are derived automatically; the 8-byte instruction discriminator comes from the profile field integrations.spot.directWithdrawDiscriminator. Signs as the vault admin."
    )
    .option(
      "--admin-keypair <path>",
      "admin keypair JSON path (or ADMIN_KEYPAIR env)"
    )
    .action(async (options: { adminKeypair?: string }) => {
      const command = "spot:earn:init-direct-withdraw";

      const { globals, profile, ctx } = await loadCommandContext(program);
      const vault = requireVaultAddress(profile, { command });
      const assetMint = requireAssetMint(profile);
      const instructionDiscriminator = requireSpotDirectWithdrawDiscriminator(
        profile,
        { command }
      );
      const lookupTableAddresses = resolveLookupTableAddresses(profile, {
        command,
      });
      const processorOptions = resolveProcessorOptions(globals);
      const admin = await loadRoleSigner("admin", options.adminKeypair);

      const operation = await buildSpotEarnInitDirectWithdrawOperation(ctx, {
        admin,
        vault,
        assetMint,
        instructionDiscriminator,
        lookupTableAddresses,
      });

      await processOperation({
        ctx,
        payer: admin,
        operation,
        mode: globals.mode,
        options: processorOptions,
      });
    });
}

/**
 * Read-only Spot queries (`spot:query:*`). Like the vault queries these never
 * build a transaction, so they ignore `--mode` and need no signer keypair.
 */
function registerSpotQueryCommands(program: Command): void {
  program
    .command("spot:query:strategy-positions")
    .summary("print the vault's Spot/Earn strategy positions as JSON")
    .description(
      "Read the vault's total value and per-strategy position values, augmenting each with the strategy's current raw foreign-token balance where the strategy is backed by a token mint (e.g. a Spot foreign asset; null for a Jupiter Earn lending position). Read-only: ignores --mode and needs no keypair."
    )
    .action(async () => {
      const command = "spot:query:strategy-positions";

      const { profile, ctx } = await loadCommandContext(program);
      const vault = requireVaultAddress(profile, { command });

      const snapshot = await querySpotStrategyPositions(ctx, { vault });
      printJson(snapshot);
    });
}

/** Spot / Earn strategies (`spot:*`). */
export function registerSpotCommands(program: Command): void {
  registerSpotSwapCommands(program);
  registerSpotEarnCommands(program);
  registerSpotQueryCommands(program);
}

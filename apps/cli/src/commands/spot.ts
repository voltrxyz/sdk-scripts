import type { Command } from "commander";
import {
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
  buildSpotSwapBuyOperation,
  buildSpotSwapInitOperation,
  buildSpotSwapSellOperation,
  querySpotStrategyPositions,
  type SpotEarnDepositArgs,
  type SpotSwapArgs,
} from "@voltr/scripts-spot";
import { loadCommandContext, resolveProcessorOptions } from "../lib/globals.js";
import { printJson } from "../lib/output.js";
import { parseAmount, parseBps, parseCount } from "../lib/parse.js";
import { addRoleKeypairOption, loadRoleSigner } from "../lib/signers.js";

type SpotSwapBuilder = (
  ctx: ScriptContext,
  args: SpotSwapArgs
) => Promise<BuiltOperation>;

type EarnAmountBuilder = (
  ctx: ScriptContext,
  args: SpotEarnDepositArgs
) => Promise<BuiltOperation>;

// --- spot swap strategy commands (`spot:swap:*`) ---

/**
 * Register a spot swap command (`spot:swap:buy` / `spot:swap:sell`). Both sides
 * share the same flags and profile fields, so they differ only by command name
 * and builder. The manager signs.
 */
function registerSpotSwapCommand(
  program: Command,
  command: "spot:swap:buy" | "spot:swap:sell",
  builder: SpotSwapBuilder
): void {
  const side = command.endsWith("buy") ? "buy" : "sell";
  addRoleKeypairOption(
    program
      .command(command)
      .summary(`${side} the foreign asset via spot swap`)
      .description(
        `${side === "buy" ? "Buy" : "Sell"} the configured foreign asset against the vault asset via a Jupiter spot swap. --amount is the raw input amount in smallest units (vault asset for buy, foreign asset for sell). Signs as the vault manager.`
      ),
    "manager"
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
        const { foreignMint, foreignTokenProgram, assetOracle, foreignOracle } =
          requireSpotIntegration(profile, { command });
        const lookupTableAddresses = resolveLookupTableAddresses(profile, {
          command,
        });
        const amount = parseAmount(options.amount, "--amount");
        const slippageBps = parseBps(options.slippageBps, "--slippage-bps");
        const jupiterMaxAccounts = parseCount(
          options.jupiterMaxAccounts,
          "--jupiter-max-accounts"
        );
        const minimumThresholdAmountOut = options.minimumThresholdAmountOut
          ? parseAmount(
              options.minimumThresholdAmountOut,
              "--minimum-threshold-amount-out"
            )
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

/** Spot swap strategy commands (`spot:swap:*`): init + buy/sell. */
function registerSpotSwapCommands(program: Command): void {
  const command = "spot:swap:init";
  addRoleKeypairOption(
    program
      .command(command)
      .summary("initialize a Spot swap strategy")
      .description(
        "Initialize a Spot swap strategy (its strategy id is the foreign mint): creates the strategy auth's asset and foreign token accounts and registers both Pyth oracle init receipts. Signs as the vault manager."
      ),
    "manager"
  ).action(async (options: { managerKeypair?: string }) => {
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

    const operation = await buildSpotSwapInitOperation(ctx, {
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

  registerSpotSwapCommand(program, "spot:swap:buy", buildSpotSwapBuyOperation);
  registerSpotSwapCommand(program, "spot:swap:sell", buildSpotSwapSellOperation);
}

// --- Jupiter Earn strategy commands (`spot:earn:*`) ---

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
  addRoleKeypairOption(
    program
      .command(command)
      .summary(`${verb.toLowerCase()} the vault asset ${direction} Jupiter Earn`)
      .description(
        `${verb} the configured vault asset ${direction} the Jupiter Earn (lending) strategy. --amount is the raw asset amount in smallest units. Signs as the vault manager.`
      ),
    "manager"
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
      const amount = parseAmount(options.amount, "--amount");
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
  const initCommand = "spot:earn:init";
  addRoleKeypairOption(
    program
      .command(initCommand)
      .summary("initialize the Jupiter Earn strategy")
      .description(
        "Initialize the Jupiter Earn (lending) strategy for the vault asset: creates the strategy auth's asset and fToken token accounts. Run spot:earn:extend-lut afterwards if you use a lookup table. Signs as the vault manager."
      ),
    "manager"
  ).action(async (options: { managerKeypair?: string }) => {
    const { globals, profile, ctx } = await loadCommandContext(program);
    const vault = requireVaultAddress(profile, { command: initCommand });
    const assetMint = requireAssetMint(profile);
    const assetTokenProgram = requireAssetTokenProgram(profile);
    const lookupTableAddresses = resolveLookupTableAddresses(profile, {
      command: initCommand,
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

  const extendLutCommand = "spot:earn:extend-lut";
  addRoleKeypairOption(
    program
      .command(extendLutCommand)
      .summary("extend the lookup table with the Jupiter Earn strategy accounts")
      .description(
        "Extend the profile's lookup table (vault.lookupTableAddress) with every account the Jupiter Earn init/deposit/withdraw transactions touch, so they fit within transaction size limits. Already-present addresses are skipped. The manager is the lookup table authority and payer."
      ),
    "manager"
  ).action(async (options: { managerKeypair?: string }) => {
    const { globals, profile, ctx } = await loadCommandContext(program);
    const vault = requireVaultAddress(profile, { command: extendLutCommand });
    const assetMint = requireAssetMint(profile);
    const assetTokenProgram = requireAssetTokenProgram(profile);
    const lookupTable = requireLookupTableAddress(profile, {
      command: extendLutCommand,
    });
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

  const initDirectWithdrawCommand = "spot:earn:init-direct-withdraw";
  addRoleKeypairOption(
    program
      .command(initDirectWithdrawCommand)
      .summary("register Jupiter Earn as a vault direct-withdraw strategy")
      .description(
        "Register the Jupiter Earn (lending) strategy as a direct-withdraw strategy on the vault. The strategy (the Jupiter lending PDA) and the Spot adaptor program are derived automatically; the 8-byte instruction discriminator comes from the profile field integrations.spot.directWithdrawDiscriminator. Signs as the vault admin."
      ),
    "admin"
  ).action(async (options: { adminKeypair?: string }) => {
    const { globals, profile, ctx } = await loadCommandContext(program);
    const vault = requireVaultAddress(profile, {
      command: initDirectWithdrawCommand,
    });
    const assetMint = requireAssetMint(profile);
    const instructionDiscriminator = requireSpotDirectWithdrawDiscriminator(
      profile,
      { command: initDirectWithdrawCommand }
    );
    const lookupTableAddresses = resolveLookupTableAddresses(profile, {
      command: initDirectWithdrawCommand,
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

// --- read-only Spot queries (`spot:query:*`) ---

/**
 * Read-only Spot queries (`spot:query:*`). Like the vault queries these never
 * build a transaction, so they ignore `--mode` and need no signer keypair.
 */
function registerSpotQueryCommands(program: Command): void {
  const command = "spot:query:strategy-positions";
  program
    .command(command)
    .summary("print the vault's Spot/Earn strategy positions as JSON")
    .description(
      "Read the vault's total value and per-strategy position values, augmenting each with the strategy's current raw foreign-token balance where the strategy is backed by a token mint (e.g. a Spot foreign asset; null for a Jupiter Earn lending position). Read-only: ignores --mode and needs no keypair."
    )
    .action(async () => {
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

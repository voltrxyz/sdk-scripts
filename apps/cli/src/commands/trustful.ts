import type { Command } from "commander";
import {
  processOperation,
  requireAssetMint,
  requireAssetTokenProgram,
  requireTrustfulIntegration,
  requireVaultAddress,
  resolveLookupTableAddresses,
  type BuiltOperation,
  type ScriptContext,
} from "@voltr/scripts-core";
import {
  buildTrustfulArbitraryDepositOperation,
  buildTrustfulArbitraryInitOperation,
  buildTrustfulArbitraryWithdrawOperation,
  buildTrustfulCurveBorrowOperation,
  buildTrustfulCurveInitOperation,
  buildTrustfulCurveRemoveOperation,
  buildTrustfulCurveRepayOperation,
  type TrustfulCurveBorrowArgs,
  type TrustfulCurveRepayArgs,
} from "@voltr/scripts-trustful";
import { loadCommandContext, resolveProcessorOptions } from "../lib/globals.js";
import { parseAddress, parseAmount, parseBps } from "../lib/parse.js";
import { addRoleKeypairOption, loadRoleSigner } from "../lib/signers.js";

type TrustfulCurveCommandArgs = TrustfulCurveBorrowArgs & TrustfulCurveRepayArgs;

type CurveBuilder = (
  ctx: ScriptContext,
  args: TrustfulCurveCommandArgs
) => Promise<BuiltOperation>;

// --- arbitrary strategy commands (`trustful:arbitrary:*`) ---
//
// All three arbitrary commands target an operator-named strategy, so they read
// `integrations.trustful.strategySeedString` from the profile (the curve
// commands below use the adaptor's fixed "curve" seed instead). The manager
// signs — strategy lifecycle and allocation are manager operations.

/** Trustful arbitrary strategy commands (`trustful:arbitrary:*`). */
function registerArbitraryCommands(program: Command): void {
  const initCommand = "trustful:arbitrary:init";
  addRoleKeypairOption(
    program
      .command(initCommand)
      .summary("initialize a Trustful arbitrary strategy")
      .description(
        "Initialize a Trustful arbitrary strategy: create the vault-strategy asset account (if missing), then initialize the strategy named by integrations.trustful.strategySeedString. Signs as the vault manager."
      ),
    "manager"
  ).action(async (options: { managerKeypair?: string }) => {
    const { globals, profile, ctx } = await loadCommandContext(program);
    const vault = requireVaultAddress(profile, { command: initCommand });
    const assetMint = requireAssetMint(profile);
    const assetTokenProgram = requireAssetTokenProgram(profile);
    const { strategySeedString } = requireTrustfulIntegration(profile, {
      command: initCommand,
    });
    const lookupTableAddresses = resolveLookupTableAddresses(profile, {
      command: initCommand,
    });
    const processorOptions = resolveProcessorOptions(globals);
    const manager = await loadRoleSigner("manager", options.managerKeypair);

    const operation = await buildTrustfulArbitraryInitOperation(ctx, {
      manager,
      vault,
      assetMint,
      assetTokenProgram,
      strategySeedString,
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

  const depositCommand = "trustful:arbitrary:deposit";
  addRoleKeypairOption(
    program
      .command(depositCommand)
      .summary("deposit into a Trustful arbitrary strategy")
      .description(
        "Deposit vault assets into a Trustful arbitrary strategy. --amount is the raw asset amount in smallest units. Prints the withdrawal-holding account to return strategy assets to before withdrawing. Signs as the vault manager."
      ),
    "manager"
  )
    .requiredOption("--amount <raw>", "raw asset amount in smallest units")
    .requiredOption(
      "--destination <address>",
      "destination asset token account the strategy deposits into"
    )
    .requiredOption(
      "--position-value-after <raw>",
      "expected position value after deposit, raw smallest units"
    )
    .action(
      async (options: {
        managerKeypair?: string;
        amount: string;
        destination: string;
        positionValueAfter: string;
      }) => {
        const { globals, profile, ctx } = await loadCommandContext(program);
        const vault = requireVaultAddress(profile, { command: depositCommand });
        const assetMint = requireAssetMint(profile);
        const assetTokenProgram = requireAssetTokenProgram(profile);
        const { strategySeedString } = requireTrustfulIntegration(profile, {
          command: depositCommand,
        });
        const lookupTableAddresses = resolveLookupTableAddresses(profile, {
          command: depositCommand,
        });
        const amount = parseAmount(options.amount, "--amount");
        const destinationAssetTokenAccount = parseAddress(
          options.destination,
          "--destination"
        );
        const positionValueAfterDeposit = parseAmount(
          options.positionValueAfter,
          "--position-value-after"
        );
        const processorOptions = resolveProcessorOptions(globals);
        const manager = await loadRoleSigner("manager", options.managerKeypair);

        const operation = await buildTrustfulArbitraryDepositOperation(ctx, {
          manager,
          vault,
          assetMint,
          assetTokenProgram,
          strategySeedString,
          destinationAssetTokenAccount,
          amount,
          positionValueAfterDeposit,
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

  const withdrawCommand = "trustful:arbitrary:withdraw";
  addRoleKeypairOption(
    program
      .command(withdrawCommand)
      .summary("withdraw from a Trustful arbitrary strategy")
      .description(
        "Withdraw assets from a Trustful arbitrary strategy back into the vault. --amount is the raw asset amount in smallest units. Return strategy assets to the withdrawal-holding account (printed by trustful:arbitrary:deposit) before running this. Signs as the vault manager."
      ),
    "manager"
  )
    .requiredOption("--amount <raw>", "raw asset amount in smallest units")
    .requiredOption(
      "--position-value-after <raw>",
      "expected position value after withdraw, raw smallest units"
    )
    .action(
      async (options: {
        managerKeypair?: string;
        amount: string;
        positionValueAfter: string;
      }) => {
        const { globals, profile, ctx } = await loadCommandContext(program);
        const vault = requireVaultAddress(profile, { command: withdrawCommand });
        const assetMint = requireAssetMint(profile);
        const assetTokenProgram = requireAssetTokenProgram(profile);
        const { strategySeedString } = requireTrustfulIntegration(profile, {
          command: withdrawCommand,
        });
        const lookupTableAddresses = resolveLookupTableAddresses(profile, {
          command: withdrawCommand,
        });
        const amount = parseAmount(options.amount, "--amount");
        const positionValueAfterWithdraw = parseAmount(
          options.positionValueAfter,
          "--position-value-after"
        );
        const processorOptions = resolveProcessorOptions(globals);
        const manager = await loadRoleSigner("manager", options.managerKeypair);

        const operation = await buildTrustfulArbitraryWithdrawOperation(ctx, {
          manager,
          vault,
          assetMint,
          assetTokenProgram,
          strategySeedString,
          amount,
          positionValueAfterWithdraw,
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

// --- curve strategy commands (`trustful:curve:*`) ---
//
// The curve strategy is a per-vault singleton seeded by the adaptor's fixed
// "curve" constant, so none of these take a strategy seed flag. The manager
// signs all four.

/**
 * Register a Trustful curve transfer command (`trustful:curve:borrow` /
 * `trustful:curve:repay`). Both share the same flags and profile fields.
 */
function registerCurveCommand(
  program: Command,
  command: "trustful:curve:borrow" | "trustful:curve:repay",
  builder: CurveBuilder
): void {
  const verb = command.endsWith("borrow") ? "Borrow" : "Repay";
  addRoleKeypairOption(
    program
      .command(command)
      .summary(`${verb.toLowerCase()} against the Trustful curve strategy`)
      .description(
        `${verb} against the Trustful curve strategy. --amount is the raw asset amount in smallest units. Signs as the vault manager.`
      ),
    "manager"
  )
    .requiredOption("--amount <raw>", "raw asset amount in smallest units")
    .requiredOption("--borrow-rate-bps <bps>", "borrow rate in basis points")
    .action(
      async (options: {
        managerKeypair?: string;
        amount: string;
        borrowRateBps: string;
      }) => {
        const { globals, profile, ctx } = await loadCommandContext(program);
        const vault = requireVaultAddress(profile, { command });
        const assetMint = requireAssetMint(profile);
        const assetTokenProgram = requireAssetTokenProgram(profile);
        const lookupTableAddresses = resolveLookupTableAddresses(profile, {
          command,
        });
        const amount = parseAmount(options.amount, "--amount");
        const borrowRateBps = parseBps(
          options.borrowRateBps,
          "--borrow-rate-bps"
        );
        const processorOptions = resolveProcessorOptions(globals);
        const manager = await loadRoleSigner("manager", options.managerKeypair);

        const operation = await builder(ctx, {
          manager,
          vault,
          assetMint,
          assetTokenProgram,
          amount,
          borrowRateBps,
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

/** Trustful curve strategy commands (`trustful:curve:*`). */
function registerCurveCommands(program: Command): void {
  const initCommand = "trustful:curve:init";
  addRoleKeypairOption(
    program
      .command(initCommand)
      .summary("initialize the Trustful curve strategy")
      .description(
        "Initialize the Trustful curve strategy: create the withdrawal-holding, vault-strategy, and manager asset accounts (if missing), then initialize the strategy. Signs as the vault manager."
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

    const operation = await buildTrustfulCurveInitOperation(ctx, {
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

  registerCurveCommand(
    program,
    "trustful:curve:borrow",
    buildTrustfulCurveBorrowOperation
  );
  registerCurveCommand(
    program,
    "trustful:curve:repay",
    buildTrustfulCurveRepayOperation
  );

  const removeCommand = "trustful:curve:remove";
  addRoleKeypairOption(
    program
      .command(removeCommand)
      .summary("close the Trustful curve strategy")
      .description(
        "Close the Trustful curve strategy via the vault SDK. Signs as the vault manager."
      ),
    "manager"
  ).action(async (options: { managerKeypair?: string }) => {
    const { globals, profile, ctx } = await loadCommandContext(program);
    const vault = requireVaultAddress(profile, { command: removeCommand });
    const lookupTableAddresses = resolveLookupTableAddresses(profile, {
      command: removeCommand,
    });
    const processorOptions = resolveProcessorOptions(globals);
    const manager = await loadRoleSigner("manager", options.managerKeypair);

    const operation = await buildTrustfulCurveRemoveOperation(ctx, {
      manager,
      vault,
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

/** Trustful arbitrary / curve strategies (`trustful:*`). */
export function registerTrustfulCommands(program: Command): void {
  registerArbitraryCommands(program);
  registerCurveCommands(program);
}

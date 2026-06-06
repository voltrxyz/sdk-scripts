import type { Command } from "commander";
import {
  asAddress,
  parseBigintAmount,
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
import { CliError } from "../lib/errors.js";
import { loadCommandContext, resolveProcessorOptions } from "../lib/globals.js";
import { loadRoleSigner } from "../lib/signers.js";

type TrustfulCurveCommandArgs = TrustfulCurveBorrowArgs & TrustfulCurveRepayArgs;

type CurveBuilder = (
  ctx: ScriptContext,
  args: TrustfulCurveCommandArgs
) => Promise<BuiltOperation>;

function parseBorrowRateBps(value: string): number {
  const bps = Number(value);
  if (!Number.isInteger(bps) || bps < 0 || bps > 10_000) {
    throw new CliError(
      `--borrow-rate-bps must be an integer between 0 and 10000: ${value}`
    );
  }
  return bps;
}

// --- arbitrary strategy commands ---
//
// All three arbitrary commands target an operator-named strategy, so they read
// `integrations.trustful.strategySeedString` from the profile (the curve
// commands below use the adaptor's fixed "curve" seed instead). The manager
// signs — strategy lifecycle and allocation are manager operations.

/** Trustful arbitrary strategy commands (`trustful:arbitrary:*`). */
function registerArbitraryCommands(program: Command): void {
  program
    .command("trustful:arbitrary:init")
    .summary("initialize a Trustful arbitrary strategy")
    .description(
      "Initialize a Trustful arbitrary strategy: create the vault-strategy asset account (if missing), then initialize the strategy named by integrations.trustful.strategySeedString."
    )
    .option(
      "--manager-keypair <path>",
      "manager keypair JSON path (or MANAGER_KEYPAIR env)"
    )
    .action(async (options: { managerKeypair?: string }) => {
      const command = "trustful:arbitrary:init";

      const { globals, profile, ctx } = await loadCommandContext(program);
      const vault = requireVaultAddress(profile, { command });
      const assetMint = requireAssetMint(profile);
      const assetTokenProgram = requireAssetTokenProgram(profile);
      const { strategySeedString } = requireTrustfulIntegration(profile, {
        command,
      });
      const lookupTableAddresses = resolveLookupTableAddresses(profile, {
        command,
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

  program
    .command("trustful:arbitrary:deposit")
    .summary("deposit into a Trustful arbitrary strategy")
    .description(
      "Deposit vault assets into a Trustful arbitrary strategy. Prints the withdrawal-holding account to return strategy assets to before withdrawing."
    )
    .option(
      "--manager-keypair <path>",
      "manager keypair JSON path (or MANAGER_KEYPAIR env)"
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
        const command = "trustful:arbitrary:deposit";

        const { globals, profile, ctx } = await loadCommandContext(program);
        const vault = requireVaultAddress(profile, { command });
        const assetMint = requireAssetMint(profile);
        const assetTokenProgram = requireAssetTokenProgram(profile);
        const { strategySeedString } = requireTrustfulIntegration(profile, {
          command,
        });
        const lookupTableAddresses = resolveLookupTableAddresses(profile, {
          command,
        });
        const amount = parseBigintAmount(options.amount);
        const destinationAssetTokenAccount = asAddress(
          options.destination,
          "--destination"
        );
        const positionValueAfterDeposit = parseBigintAmount(
          options.positionValueAfter
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

  program
    .command("trustful:arbitrary:withdraw")
    .summary("withdraw from a Trustful arbitrary strategy")
    .description(
      "Withdraw assets from a Trustful arbitrary strategy back into the vault. Return strategy assets to the withdrawal-holding account (printed by trustful:arbitrary:deposit) before running this."
    )
    .option(
      "--manager-keypair <path>",
      "manager keypair JSON path (or MANAGER_KEYPAIR env)"
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
        const command = "trustful:arbitrary:withdraw";

        const { globals, profile, ctx } = await loadCommandContext(program);
        const vault = requireVaultAddress(profile, { command });
        const assetMint = requireAssetMint(profile);
        const assetTokenProgram = requireAssetTokenProgram(profile);
        const { strategySeedString } = requireTrustfulIntegration(profile, {
          command,
        });
        const lookupTableAddresses = resolveLookupTableAddresses(profile, {
          command,
        });
        const amount = parseBigintAmount(options.amount);
        const positionValueAfterWithdraw = parseBigintAmount(
          options.positionValueAfter
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

// --- curve strategy commands ---
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
  program
    .command(command)
    .summary(`${verb.toLowerCase()} against the Trustful curve strategy`)
    .description(`${verb} against the Trustful curve strategy.`)
    .option(
      "--manager-keypair <path>",
      "manager keypair JSON path (or MANAGER_KEYPAIR env)"
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
        const amount = parseBigintAmount(options.amount);
        const borrowRateBps = parseBorrowRateBps(options.borrowRateBps);
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
  program
    .command("trustful:curve:init")
    .summary("initialize the Trustful curve strategy")
    .description(
      "Initialize the Trustful curve strategy: create the withdrawal-holding, vault-strategy, and manager asset accounts (if missing), then initialize the strategy."
    )
    .option(
      "--manager-keypair <path>",
      "manager keypair JSON path (or MANAGER_KEYPAIR env)"
    )
    .action(async (options: { managerKeypair?: string }) => {
      const command = "trustful:curve:init";

      const { globals, profile, ctx } = await loadCommandContext(program);
      const vault = requireVaultAddress(profile, { command });
      const assetMint = requireAssetMint(profile);
      const assetTokenProgram = requireAssetTokenProgram(profile);
      const lookupTableAddresses = resolveLookupTableAddresses(profile, {
        command,
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

  program
    .command("trustful:curve:remove")
    .summary("close the Trustful curve strategy")
    .description("Close the Trustful curve strategy via the vault SDK.")
    .option(
      "--manager-keypair <path>",
      "manager keypair JSON path (or MANAGER_KEYPAIR env)"
    )
    .action(async (options: { managerKeypair?: string }) => {
      const command = "trustful:curve:remove";

      const { globals, profile, ctx } = await loadCommandContext(program);
      const vault = requireVaultAddress(profile, { command });
      const lookupTableAddresses = resolveLookupTableAddresses(profile, {
        command,
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

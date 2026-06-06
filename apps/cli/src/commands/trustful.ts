import type { Command } from "commander";
import {
  asAddress,
  parseBigintAmount,
  processOperation,
  requireAssetMint,
  requireAssetTokenProgram,
  requireTrustfulIntegration,
  requireVaultAddress,
  type BuiltOperation,
  type ScriptContext,
} from "@voltr/scripts-core";
import {
  buildTrustfulBorrowCurveOperation,
  buildTrustfulDepositArbitraryOperation,
  buildTrustfulRepayCurveOperation,
  type TrustfulCurveArgs,
} from "@voltr/scripts-trustful";
import { loadCommandContext, resolveProcessorOptions } from "../lib/globals.js";
import { loadRoleSigner } from "../lib/signers.js";

type CurveBuilder = (
  ctx: ScriptContext,
  args: TrustfulCurveArgs
) => Promise<BuiltOperation>;

/**
 * Register a Trustful curve command (`trustful:curve:borrow` /
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
    .summary(`${verb.toLowerCase()} against the Trustful curve strategy [not migrated]`)
    .description(
      `${verb} against the Trustful curve strategy.\nPlaceholder: the operation builder is not migrated yet.`
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
      const { strategySeedString } = requireTrustfulIntegration(profile, {
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
        strategySeedString,
        amount,
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
  program
    .command("trustful:arbitrary:deposit")
    .summary("deposit into a Trustful arbitrary strategy [not migrated]")
    .description(
      "Deposit vault assets into a Trustful arbitrary strategy.\nPlaceholder: the operation builder is not migrated yet."
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
    .option(
      "--position-value-after <raw>",
      "expected position value after deposit, raw smallest units"
    )
    .action(
      async (options: {
        managerKeypair?: string;
        amount: string;
        destination: string;
        positionValueAfter?: string;
      }) => {
        const command = "trustful:arbitrary:deposit";

        const { globals, profile, ctx } = await loadCommandContext(program);
        const vault = requireVaultAddress(profile, { command });
        const assetMint = requireAssetMint(profile);
        const assetTokenProgram = requireAssetTokenProgram(profile);
        const { strategySeedString } = requireTrustfulIntegration(profile, {
          command,
        });
        const amount = parseBigintAmount(options.amount);
        const destinationAssetTokenAccount = asAddress(
          options.destination,
          "--destination"
        );
        const positionValueAfterDeposit = options.positionValueAfter
          ? parseBigintAmount(options.positionValueAfter)
          : undefined;
        const processorOptions = resolveProcessorOptions(globals);
        const manager = await loadRoleSigner("manager", options.managerKeypair);

        const operation = await buildTrustfulDepositArbitraryOperation(ctx, {
          manager,
          vault,
          assetMint,
          assetTokenProgram,
          strategySeedString,
          destinationAssetTokenAccount,
          amount,
          positionValueAfterDeposit,
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

  registerCurveCommand(
    program,
    "trustful:curve:borrow",
    buildTrustfulBorrowCurveOperation
  );
  registerCurveCommand(
    program,
    "trustful:curve:repay",
    buildTrustfulRepayCurveOperation
  );
}

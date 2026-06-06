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
  buildTrustfulBorrowCurveOperation,
  buildTrustfulDepositArbitraryOperation,
  buildTrustfulRepayCurveOperation,
  type TrustfulBorrowCurveArgs,
  type TrustfulRepayCurveArgs,
} from "@voltr/scripts-trustful";
import { CliError } from "../lib/errors.js";
import { loadCommandContext, resolveProcessorOptions } from "../lib/globals.js";
import { loadRoleSigner } from "../lib/signers.js";

type TrustfulCurveCommandArgs = TrustfulBorrowCurveArgs & TrustfulRepayCurveArgs;

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

/** Trustful arbitrary / curve strategies (`trustful:*`). */
export function registerTrustfulCommands(program: Command): void {
  program
    .command("trustful:arbitrary:deposit")
    .summary("deposit into a Trustful arbitrary strategy")
    .description("Deposit vault assets into a Trustful arbitrary strategy.")
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

        const operation = await buildTrustfulDepositArbitraryOperation(ctx, {
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

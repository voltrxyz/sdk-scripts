import type { Command } from "commander";
import {
  parseBigintAmount,
  processOperation,
  requireAssetMint,
  requireAssetTokenProgram,
  requireSpotIntegration,
  requireVaultAddress,
  resolveLookupTableAddresses,
  type BuiltOperation,
  type ScriptContext,
} from "@voltr/scripts-core";
import {
  buildSpotBuyOperation,
  buildSpotSellOperation,
  type SpotSwapArgs,
} from "@voltr/scripts-spot";
import { CliError } from "../lib/errors.js";
import { loadCommandContext, resolveProcessorOptions } from "../lib/globals.js";
import { loadRoleSigner } from "../lib/signers.js";

type SpotBuilder = (
  ctx: ScriptContext,
  args: SpotSwapArgs
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
    .summary(`${side.toLowerCase()} the foreign asset via spot swap [not migrated]`)
    .description(
      `${side} the configured foreign asset against the vault asset via a spot swap.\nPlaceholder: the operation builder is not migrated yet.`
    )
    .option(
      "--manager-keypair <path>",
      "manager keypair JSON path (or MANAGER_KEYPAIR env)"
    )
    .requiredOption("--amount <raw>", "raw asset amount in smallest units")
    .requiredOption("--slippage-bps <bps>", "max slippage in basis points")
    .action(
      async (options: {
        managerKeypair?: string;
        amount: string;
        slippageBps: string;
      }) => {
        const { globals, profile, ctx } = await loadCommandContext(program);
        const vault = requireVaultAddress(profile, { command });
        const assetMint = requireAssetMint(profile);
        const assetTokenProgram = requireAssetTokenProgram(profile);
        const { foreignMint } = requireSpotIntegration(profile, { command });
        const lookupTableAddresses = resolveLookupTableAddresses(profile, {
          command,
        });
        const amount = parseBigintAmount(options.amount);
        const slippageBps = parseSlippageBps(options.slippageBps);
        const processorOptions = resolveProcessorOptions(globals);
        const manager = await loadRoleSigner("manager", options.managerKeypair);

        const operation = await builder(ctx, {
          manager,
          vault,
          assetMint,
          assetTokenProgram,
          foreignMint,
          amount,
          slippageBps,
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

/** Spot / Earn strategies (`spot:*`). */
export function registerSpotCommands(program: Command): void {
  registerSpotSwap(program, "spot:spot:buy", buildSpotBuyOperation);
  registerSpotSwap(program, "spot:spot:sell", buildSpotSellOperation);
}

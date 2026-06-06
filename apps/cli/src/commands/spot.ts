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

/** Spot / Earn strategies (`spot:*`). */
export function registerSpotCommands(program: Command): void {
  registerSpotSwap(program, "spot:spot:buy", buildSpotBuyOperation);
  registerSpotSwap(program, "spot:spot:sell", buildSpotSellOperation);
}

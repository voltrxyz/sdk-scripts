import type { Command } from "commander";
import {
  parseBigintAmount,
  processOperation,
  requireAssetMint,
  requireAssetTokenProgram,
  requireKaminoReserve,
  requireVaultAddress,
  resolveLookupTableAddresses,
} from "@voltr/scripts-core";
import { buildKaminoMarketDepositOperation } from "@voltr/scripts-kamino";
import { loadCommandContext, resolveProcessorOptions } from "../lib/globals.js";
import { loadRoleSigner } from "../lib/signers.js";

/**
 * Kamino strategies (`kamino:*`). Each command follows the framework path
 * (validate profile → load signer → build → process); the market deposit
 * builder is migrated in `packages/kamino`, and further strategies are added by
 * registering one command per builder here.
 */
export function registerKaminoCommands(program: Command): void {
  program
    .command("kamino:market:deposit")
    .summary("deposit vault assets into a Kamino lending market")
    .description(
      "Deposit vault assets into a Kamino lending market via the Voltr Kamino adaptor."
    )
    .option(
      "--manager-keypair <path>",
      "manager keypair JSON path (or MANAGER_KEYPAIR env)"
    )
    .requiredOption("--amount <raw>", "raw asset amount in smallest units")
    .action(async (options: { managerKeypair?: string; amount: string }) => {
      const command = "kamino:market:deposit";

      const { globals, profile, ctx } = await loadCommandContext(program);
      const vault = requireVaultAddress(profile, { command });
      const assetMint = requireAssetMint(profile);
      const assetTokenProgram = requireAssetTokenProgram(profile);
      const reserve = requireKaminoReserve(profile, { command });
      const lookupTableAddresses = resolveLookupTableAddresses(profile, {
        command,
      });
      const amount = parseBigintAmount(options.amount);
      const processorOptions = resolveProcessorOptions(globals);
      const manager = await loadRoleSigner("manager", options.managerKeypair);

      const operation = await buildKaminoMarketDepositOperation(ctx, {
        manager,
        vault,
        assetMint,
        assetTokenProgram,
        reserve,
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

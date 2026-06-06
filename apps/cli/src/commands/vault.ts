import type { Command } from "commander";
import {
  buildDepositVaultOperation,
  parseBigintAmount,
  processOperation,
  requireAssetMint,
  requireAssetTokenProgram,
  requireVaultAddress,
  resolveLookupTableAddresses,
} from "@voltr/scripts-core";
import { loadCommandContext, resolveProcessorOptions } from "../lib/globals.js";
import { loadRoleSigner } from "../lib/signers.js";

/** Shared vault operations (`vault:*`). */
export function registerVaultCommands(program: Command): void {
  program
    .command("vault:deposit")
    .summary("deposit the profile asset into the vault")
    .description("Deposit the profile asset into the configured Voltr vault.")
    .option(
      "--user-keypair <path>",
      "user keypair JSON path (or USER_KEYPAIR env)"
    )
    .requiredOption("--amount <raw>", "raw asset amount in smallest units")
    .action(async (options: { userKeypair?: string; amount: string }) => {
      const command = "vault:deposit";

      // Validate the profile (and the fields this command needs) before we
      // touch the network, load any key, or build instructions.
      const { globals, profile, ctx } = await loadCommandContext(program);
      const vault = requireVaultAddress(profile, { command });
      const assetMint = requireAssetMint(profile);
      const assetTokenProgram = requireAssetTokenProgram(profile);
      const lookupTableAddresses = resolveLookupTableAddresses(profile, {
        command,
      });
      const amount = parseBigintAmount(options.amount);
      const processorOptions = resolveProcessorOptions(globals);
      const user = await loadRoleSigner("user", options.userKeypair);

      const operation = await buildDepositVaultOperation(ctx, {
        user,
        vault,
        assetMint,
        assetTokenProgram,
        amount,
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
}

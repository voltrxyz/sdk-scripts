#!/usr/bin/env node
import { Command, Option } from "commander";
import {
  buildDepositVaultOperation,
  createScriptContext,
  loadProfile,
  loadSignerFromFile,
  parseBigintAmount,
  processOperation,
  ProfileFieldError,
  ProfileValidationError,
  requireAssetMint,
  requireAssetTokenProgram,
  requireVaultAddress,
  resolveLookupTableAddresses,
  type TxMode,
} from "@voltr/scripts-core";

const txModes = ["print", "execute", "simulate", "multisig"] as const;

const program = new Command()
  .name("voltr-scripts")
  .description("Shared Voltr vault and integration operations")
  .requiredOption("--profile <path>", "JSON profile path")
  .option("--rpc-url <url>", "RPC URL override")
  .addOption(
    new Option("--mode <mode>", "transaction mode")
      .choices([...txModes])
      .default("print")
  );

program
  .command("vault:deposit")
  .description("Deposit the profile asset into the configured Voltr vault")
  .requiredOption("--user-keypair <path>", "user keypair JSON path")
  .requiredOption("--amount <raw>", "raw asset amount in smallest units")
  .action(async (options: { userKeypair: string; amount: string }) => {
    const command = "vault:deposit";
    const globals = program.opts<{
      profile: string;
      rpcUrl?: string;
      mode: TxMode;
    }>();

    // Validate the profile (and required fields for this command) before
    // touching the network, loading keys, or building any instructions.
    const profile = await loadProfile(globals.profile);
    const vault = requireVaultAddress(profile, { command });
    const assetMint = requireAssetMint(profile);
    const assetTokenProgram = requireAssetTokenProgram(profile);
    const lookupTableAddresses = resolveLookupTableAddresses(profile, {
      command,
    });
    const amount = parseBigintAmount(options.amount);

    const ctx = createScriptContext(profile, globals.rpcUrl);
    const user = await loadSignerFromFile(options.userKeypair);

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
    });
  });

program
  .command("next")
  .description("Print the next recommended migration steps")
  .action(() => {
    console.log(
      [
        "Next migrations:",
        "1. packages/kamino: manager-deposit-market",
        "2. packages/spot: manager-initialize-spot",
        "3. packages/trustful: manager-deposit-arbitrary",
        "4. packages/core: simulate and multisig tx modes",
      ].join("\n")
    );
  });

program.parseAsync().catch((error) => {
  if (
    error instanceof ProfileValidationError ||
    error instanceof ProfileFieldError
  ) {
    console.error(error.message);
    process.exit(1);
  }
  console.error(error);
  process.exit(1);
});

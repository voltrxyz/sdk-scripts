#!/usr/bin/env node
import { Command, Option } from "commander";
import {
  asAddress,
  buildDepositVaultOperation,
  createScriptContext,
  loadProfile,
  loadSignerFromFile,
  optionalAddress,
  parseBigintAmount,
  processOperation,
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
    const globals = program.opts<{
      profile: string;
      rpcUrl?: string;
      mode: TxMode;
    }>();
    const profile = await loadProfile(globals.profile);
    const ctx = createScriptContext(profile, globals.rpcUrl);
    const user = await loadSignerFromFile(options.userKeypair);
    const lookupTableAddress = optionalAddress(profile.vault.lookupTableAddress);

    const operation = await buildDepositVaultOperation({
      rpc: ctx.rpc,
      user,
      vault: asAddress(profile.vault.vaultAddress, "vault.vaultAddress"),
      assetMint: asAddress(
        profile.vault.assetMintAddress,
        "vault.assetMintAddress"
      ),
      assetTokenProgram: asAddress(
        profile.vault.assetTokenProgram,
        "vault.assetTokenProgram"
      ),
      amount: parseBigintAmount(options.amount),
      lookupTableAddresses:
        profile.vault.useLookupTable && lookupTableAddress
          ? [lookupTableAddress]
          : [],
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
  console.error(error);
  process.exit(1);
});


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
  type PriorityFeeStrategy,
  type TxMode,
} from "@voltr/scripts-core";

const txModes = ["print", "execute", "simulate", "multisig"] as const;
const priorityFeeKinds = ["helius", "rpc", "fixed", "none"] as const;

const program = new Command()
  .name("voltr-scripts")
  .description("Shared Voltr vault and integration operations")
  .requiredOption("--profile <path>", "JSON profile path")
  .option("--rpc-url <url>", "RPC URL override")
  .addOption(
    new Option("--mode <mode>", "transaction mode")
      .choices([...txModes])
      .default("print")
  )
  .option("--multisig-address <address>", "multisig vault PDA (for --mode multisig)")
  .addOption(
    new Option("--priority-fee <kind>", "priority fee strategy")
      .choices([...priorityFeeKinds])
      .default("helius")
  )
  .option(
    "--priority-fee-micro-lamports <n>",
    "microLamports value for --priority-fee fixed (or fallback)"
  )
  .option("--compute-unit-limit <n>", "override compute-unit limit");

interface GlobalOptions {
  profile: string;
  rpcUrl?: string;
  mode: TxMode;
  multisigAddress?: string;
  priorityFee: (typeof priorityFeeKinds)[number];
  priorityFeeMicroLamports?: string;
  computeUnitLimit?: string;
}

function resolveProcessorOptions(globals: GlobalOptions) {
  const fixedMicroLamports = globals.priorityFeeMicroLamports
    ? BigInt(globals.priorityFeeMicroLamports)
    : undefined;

  let priorityFee: PriorityFeeStrategy;
  switch (globals.priorityFee) {
    case "none":
      priorityFee = { kind: "none" };
      break;
    case "fixed":
      if (fixedMicroLamports == null) {
        throw new Error(
          "--priority-fee fixed requires --priority-fee-micro-lamports"
        );
      }
      priorityFee = { kind: "fixed", microLamports: fixedMicroLamports };
      break;
    case "rpc":
      priorityFee = { kind: "rpc", fallbackMicroLamports: fixedMicroLamports };
      break;
    case "helius":
      priorityFee = { kind: "helius", fallbackMicroLamports: fixedMicroLamports };
      break;
  }

  return {
    priorityFee,
    computeUnitLimit: globals.computeUnitLimit
      ? Number(globals.computeUnitLimit)
      : undefined,
    multisigAddress: globals.multisigAddress
      ? asAddress(globals.multisigAddress, "--multisig-address")
      : undefined,
  };
}

program
  .command("vault:deposit")
  .description("Deposit the profile asset into the configured Voltr vault")
  .requiredOption("--user-keypair <path>", "user keypair JSON path")
  .requiredOption("--amount <raw>", "raw asset amount in smallest units")
  .action(async (options: { userKeypair: string; amount: string }) => {
    const globals = program.opts<GlobalOptions>();
    const profile = await loadProfile(globals.profile);
    const ctx = createScriptContext(profile, globals.rpcUrl);
    const user = await loadSignerFromFile(options.userKeypair);
    const lookupTableAddress = optionalAddress(profile.vault.lookupTableAddress);
    const processorOptions = resolveProcessorOptions(globals);

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
      options: processorOptions,
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
      ].join("\n")
    );
  });

program.parseAsync().catch((error) => {
  console.error(error);
  process.exit(1);
});

#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Command, Option } from "commander";
import {
  address,
  type Address,
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
  type PriorityFeeStrategy,
  type ProcessorOptions,
  type TxMode,
} from "@voltr/scripts-core";

const txModes = ["print", "execute", "simulate", "multisig"] as const;
const priorityFeeKinds = ["helius", "rpc", "fixed", "none"] as const;

interface GlobalOptions {
  profile: string;
  rpcUrl?: string;
  mode: TxMode;
  multisigAddress?: string;
  priorityFee: (typeof priorityFeeKinds)[number];
  priorityFeeMicroLamports?: string;
  computeUnitLimit?: string;
}

function parseMultisigAddress(value: string | undefined): Address | undefined {
  if (!value) return undefined;
  try {
    return address(value);
  } catch {
    throw new Error(`--multisig-address must be a valid base58 Solana address: ${value}`);
  }
}

function resolveProcessorOptions(globals: GlobalOptions): ProcessorOptions {
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
      priorityFee = {
        kind: "helius",
        fallbackMicroLamports: fixedMicroLamports,
      };
      break;
  }

  return {
    priorityFee,
    computeUnitLimit: globals.computeUnitLimit
      ? Number(globals.computeUnitLimit)
      : undefined,
    multisigAddress: parseMultisigAddress(globals.multisigAddress),
  };
}

/**
 * Builds the commander program. Exported (rather than parsed at import time) so
 * tests can construct it and exercise argument validation in-process without
 * spawning a subprocess or running any command action. The program is only
 * parsed automatically when this file is the process entrypoint (see bottom).
 */
export function createProgram(): Command {
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

  program
    .command("vault:deposit")
    .description("Deposit the profile asset into the configured Voltr vault")
    .requiredOption("--user-keypair <path>", "user keypair JSON path")
    .requiredOption("--amount <raw>", "raw asset amount in smallest units")
    .action(async (options: { userKeypair: string; amount: string }) => {
      const command = "vault:deposit";
      const globals = program.opts<GlobalOptions>();

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

      const processorOptions = resolveProcessorOptions(globals);
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

  return program;
}

/** Maps known CLI errors to friendly output and a non-zero exit code. */
export function handleCliError(error: unknown): never {
  if (
    error instanceof ProfileValidationError ||
    error instanceof ProfileFieldError
  ) {
    console.error(error.message);
    process.exit(1);
  }
  console.error(error);
  process.exit(1);
}

function isMainModule(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return realpathSync(entry) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isMainModule()) {
  // `pnpm cli -- <args>` forwards a leading `--` separator into argv; commander
  // would otherwise read it as "treat the rest as operands" and skip option
  // parsing. Drop a single leading `--` so the documented `pnpm cli -- …` form
  // parses normally. (Direct `node dist/index.js …` invocations are unaffected.)
  const argv = process.argv.slice(2);
  const args = argv[0] === "--" ? argv.slice(1) : argv;
  createProgram().parseAsync(args, { from: "user" }).catch(handleCliError);
}

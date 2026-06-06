import { Command, Option } from "commander";
import {
  address,
  createScriptContext,
  loadProfile,
  type Address,
  type PriorityFeeStrategy,
  type ProcessorOptions,
  type ScriptContext,
  type ScriptProfile,
  type TxMode,
} from "@voltr/scripts-core";
import { CliError } from "./errors.js";

export const TX_MODES = ["print", "execute", "simulate", "multisig"] as const;
export const PRIORITY_FEE_KINDS = ["helius", "rpc", "fixed", "none"] as const;

export type PriorityFeeKind = (typeof PRIORITY_FEE_KINDS)[number];

/** Options declared on the root program and shared by every command. */
export interface GlobalOptions {
  profile: string;
  rpcUrl?: string;
  mode: TxMode;
  multisigAddress?: string;
  priorityFee: PriorityFeeKind;
  priorityFeeMicroLamports?: string;
  computeUnitLimit?: string;
}

/**
 * Attach the global options to the root program. Kept here so the entry point
 * stays small and the option set is defined in exactly one place.
 */
export function addGlobalOptions(program: Command): Command {
  return program
    .requiredOption("--profile <path>", "JSON profile path")
    .option(
      "--rpc-url <url>",
      "RPC URL override (else RPC_URL / HELIUS_RPC_URL env, else profile.rpcUrl)"
    )
    .addOption(
      new Option("--mode <mode>", "transaction mode")
        .choices([...TX_MODES])
        .default("print")
    )
    .option(
      "--multisig-address <address>",
      "multisig vault PDA (required for --mode multisig)"
    )
    .addOption(
      new Option("--priority-fee <kind>", "priority fee strategy")
        .choices([...PRIORITY_FEE_KINDS])
        .default("helius")
    )
    .option(
      "--priority-fee-micro-lamports <n>",
      "microLamports for --priority-fee fixed (or fallback)"
    )
    .option("--compute-unit-limit <n>", "override compute-unit limit");
}

export interface CommandContext {
  globals: GlobalOptions;
  profile: ScriptProfile;
  ctx: ScriptContext;
}

/**
 * Load and validate the profile named by the global `--profile` flag and build
 * the RPC-backed `ScriptContext`. Used by every transaction command so the
 * "read globals → load profile → make context" boilerplate lives in one place.
 */
export async function loadCommandContext(
  program: Command
): Promise<CommandContext> {
  const globals = program.opts<GlobalOptions>();
  const profile = await loadProfile(globals.profile);
  const ctx = createScriptContext(profile, globals.rpcUrl);
  return { globals, profile, ctx };
}

function parseMultisigAddress(value: string | undefined): Address | undefined {
  if (!value) return undefined;
  try {
    return address(value);
  } catch {
    throw new CliError(
      `--multisig-address must be a valid base58 Solana address: ${value}`
    );
  }
}

/**
 * Translate the priority-fee and multisig global flags into the
 * `ProcessorOptions` shape the core processor expects, validating the
 * mode-specific requirements up front so failures are actionable.
 */
export function resolveProcessorOptions(
  globals: GlobalOptions
): ProcessorOptions {
  if (globals.mode === "multisig" && !globals.multisigAddress) {
    throw new CliError(
      "--mode multisig requires --multisig-address <pubkey> (the vault PDA that signs on-chain)."
    );
  }

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
        throw new CliError(
          "--priority-fee fixed requires --priority-fee-micro-lamports <n>."
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

import type { KeyPairSigner } from "@solana/kit";
import type {
  BuiltOperation,
  ProcessorOptions,
  ProcessResult,
  ScriptContext,
  TxMode,
} from "../types.js";
import { getAddressesByLookupTable } from "./lut.js";
import { buildMultisigPayload } from "./multisig.js";
import { sendAndConfirmOptimizedTx, type TransactionFailure } from "./send.js";
import { simulateTx } from "./simulate.js";

export interface ProcessOperationArgs {
  ctx: ScriptContext;
  payer: KeyPairSigner;
  operation: BuiltOperation;
  mode: TxMode;
  options?: ProcessorOptions;
}

export async function processOperation(
  args: ProcessOperationArgs
): Promise<ProcessResult> {
  const { ctx, mode, operation, payer } = args;
  const options = args.options ?? {};

  try {
    switch (mode) {
      case "print":
        return runPrintMode(operation);
      case "simulate":
        return await runSimulateMode(ctx, payer, operation, options);
      case "multisig":
        return runMultisigMode(operation, options);
      case "execute":
        return await runExecuteMode(ctx, payer, operation, options);
    }
  } catch (error) {
    throw decorateError(error, operation.label, mode);
  }
}

function runPrintMode(operation: BuiltOperation): ProcessResult {
  const lookupTableAddresses = operation.lookupTableAddresses ?? [];
  const summary = {
    label: operation.label,
    instructionCount: operation.instructions.length,
    lookupTableAddresses,
  };
  console.log(JSON.stringify(summary, null, 2));
  logOperationMetadata(operation);
  return { mode: "print", ...summary };
}

/**
 * Print a builder's structured {@link BuiltOperation.metadata} (e.g. the
 * Trustful "withdrawal holding account") so important operator-facing values the
 * legacy scripts used to `console.log` survive the migration. Side-effect free
 * and independent of the `ProcessResult` shape.
 */
function logOperationMetadata(operation: BuiltOperation): void {
  if (!operation.metadata) return;
  const entries = Object.entries(operation.metadata);
  if (entries.length === 0) return;
  console.log(`${operation.label} metadata:`);
  for (const [key, value] of entries) {
    console.log(`  ${key}: ${value}`);
  }
}

async function runSimulateMode(
  ctx: ScriptContext,
  payer: KeyPairSigner,
  operation: BuiltOperation,
  options: ProcessorOptions
): Promise<ProcessResult> {
  const addressesByLookupTable = operation.lookupTableAddresses?.length
    ? await getAddressesByLookupTable(operation.lookupTableAddresses, ctx.rpc)
    : {};

  const { simulation, explorerUrl } = await simulateTx({
    rpc: ctx.rpc,
    instructions: operation.instructions,
    addressesByLookupTable,
    payerSigner: payer,
  });

  console.log(
    `${operation.label} simulation: ${simulation.err ? "FAILED" : "OK"}`
  );
  if (simulation.unitsConsumed != null) {
    console.log(`  computeUnits: ${simulation.unitsConsumed}`);
  }
  if (simulation.logs.length > 0) {
    console.log("  logs:");
    for (const line of simulation.logs) console.log(`    ${line}`);
  }
  if (simulation.err) {
    console.log(`  error: ${JSON.stringify(simulation.err)}`);
  }
  if (!options.quiet) {
    console.log(`  explorer: ${explorerUrl}`);
  }

  return { mode: "simulate", simulation, explorerUrl };
}

function runMultisigMode(
  operation: BuiltOperation,
  options: ProcessorOptions
): ProcessResult {
  if (!options.multisigAddress) {
    throw new Error(
      "multisig mode requires options.multisigAddress (the vault PDA that will sign on-chain)."
    );
  }

  const { base64Message, base58Message, explorerUrl } = buildMultisigPayload({
    instructions: operation.instructions,
    addressesByLookupTable: {},
    multisigAddress: options.multisigAddress,
    stripComputeBudget: true,
  });

  console.log(`${operation.label} multisig payload:`);
  console.log(`  base64: ${base64Message}`);
  console.log(`  base58: ${base58Message}`);
  if (!options.quiet) {
    console.log(`  explorer: ${explorerUrl}`);
  }

  return { mode: "multisig", base64Message, base58Message, explorerUrl };
}

async function runExecuteMode(
  ctx: ScriptContext,
  payer: KeyPairSigner,
  operation: BuiltOperation,
  options: ProcessorOptions
): Promise<ProcessResult> {
  const addressesByLookupTable = operation.lookupTableAddresses?.length
    ? await getAddressesByLookupTable(operation.lookupTableAddresses, ctx.rpc)
    : {};

  const { signature, computeUnitsConsumed } = await sendAndConfirmOptimizedTx({
    instructions: operation.instructions,
    rpcUrl: ctx.rpcUrl,
    payerSigner: payer,
    addressesByLookupTable,
    computeUnitLimit: options.computeUnitLimit ?? operation.computeUnitLimit ?? null,
    priorityFee: options.priorityFee,
  });

  console.log(`${operation.label} signature: ${signature}`);
  logOperationMetadata(operation);
  return { mode: "execute", signature, computeUnitsConsumed };
}

function decorateError(error: unknown, label: string, mode: TxMode): Error {
  const base = error instanceof Error ? error : new Error(String(error));
  const decorated = new Error(`[${label}/${mode}] ${base.message}`);
  (decorated as Error & { cause?: unknown }).cause = base;
  const failure = base as Partial<TransactionFailure>;
  if (failure.logs && failure.logs.length > 0) {
    console.error(`[${label}/${mode}] transaction logs:`);
    for (const line of failure.logs) console.error(`  ${line}`);
  }
  return decorated;
}

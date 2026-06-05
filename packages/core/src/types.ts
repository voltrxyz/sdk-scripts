import { createSolanaRpc, type Address, type Instruction } from "@solana/kit";
import type { ScriptProfile } from "./profile.js";

export type SolanaRpc = ReturnType<typeof createSolanaRpc>;

export type TxMode = "execute" | "simulate" | "multisig" | "print";

export interface ScriptContext {
  profile: ScriptProfile;
  rpcUrl: string;
  rpc: SolanaRpc;
}

export interface BuiltOperation {
  label: string;
  instructions: Instruction[];
  lookupTableAddresses?: Address[];
  computeUnitLimit?: number | null;
}

/**
 * Configures how priority fees are sourced for a transaction. The processor
 * picks one strategy and falls back to a fixed minimum if the optimization fails.
 *
 *   - `none`: do not attach a compute-unit price instruction.
 *   - `fixed`: use a hard-coded microLamports value.
 *   - `helius`: try Helius `getPriorityFeeEstimate` first, fall back to `rpc`.
 *   - `rpc`: use standard `getRecentPrioritizationFees` from any RPC provider.
 */
export type PriorityFeeStrategy =
  | { kind: "none" }
  | { kind: "fixed"; microLamports: bigint }
  | {
      kind: "helius";
      priorityLevel?: "Min" | "Low" | "Medium" | "High" | "VeryHigh" | "UnsafeMax";
      fallbackMicroLamports?: bigint;
    }
  | {
      kind: "rpc";
      percentile?: number;
      minMicroLamports?: bigint;
      fallbackMicroLamports?: bigint;
    };

export interface ProcessorOptions {
  /** Priority fee strategy. Defaults to a Helius attempt with rpc fallback. */
  priorityFee?: PriorityFeeStrategy;
  /** Override of compute-unit limit. Falls back to operation value, then simulation. */
  computeUnitLimit?: number | null;
  /**
   * Address that will sign on-chain in `multisig` mode (e.g. the Squads vault PDA).
   * Required for multisig mode. Ignored in other modes.
   */
  multisigAddress?: Address;
  /** Hide the compiled-tx explorer link printed in simulate / multisig modes. */
  quiet?: boolean;
}

export interface SimulationLogs {
  unitsConsumed: number | null;
  logs: string[];
  err: unknown;
}

export type ProcessResult =
  | { mode: "execute"; signature: string; computeUnitsConsumed?: number | null }
  | {
      mode: "print";
      label: string;
      instructionCount: number;
      lookupTableAddresses: Address[];
    }
  | { mode: "simulate"; simulation: SimulationLogs; explorerUrl: string }
  | {
      mode: "multisig";
      base64Message: string;
      base58Message: string;
      explorerUrl: string;
    };

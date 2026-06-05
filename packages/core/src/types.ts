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

export interface ProcessResult {
  mode: TxMode;
  signature?: string;
}

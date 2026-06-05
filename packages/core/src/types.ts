import { createSolanaRpc, type Address, type Instruction } from "@solana/kit";

export type SolanaRpc = ReturnType<typeof createSolanaRpc>;

export type Cluster = "localnet" | "devnet" | "mainnet-beta";

export type TxMode = "execute" | "simulate" | "multisig" | "print";

export interface VaultProfile {
  name?: string;
  assetMintAddress: string;
  assetTokenProgram: string;
  vaultAddress: string;
  useLookupTable?: boolean;
  lookupTableAddress?: string;
}

export interface ScriptProfile {
  name: string;
  cluster: Cluster;
  rpcUrl?: string;
  vault: VaultProfile;
  integrations?: Record<string, unknown>;
}

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


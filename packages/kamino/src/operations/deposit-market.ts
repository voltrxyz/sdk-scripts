import type { Address, KeyPairSigner } from "@solana/kit";
import type { BuiltOperation, ScriptContext } from "@voltr/scripts-core";

export interface KaminoDepositMarketArgs {
  manager: KeyPairSigner;
  vault: Address;
  assetMint: Address;
  assetTokenProgram: Address;
  reserve: Address;
  amount: bigint;
  lookupTableAddresses?: Address[];
}

export async function buildKaminoDepositMarketOperation(
  _ctx: ScriptContext,
  _args: KaminoDepositMarketArgs
): Promise<BuiltOperation> {
  throw new Error(
    "Kamino market deposit is not migrated yet. Move logic from ../voltr-kamino-scripts/src/scripts/manager-deposit-market.ts into this builder."
  );
}


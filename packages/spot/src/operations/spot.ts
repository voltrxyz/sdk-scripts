import type { Address, KeyPairSigner } from "@solana/kit";
import type { BuiltOperation, ScriptContext } from "@voltr/scripts-core";

export interface SpotSwapArgs {
  manager: KeyPairSigner;
  vault: Address;
  assetMint: Address;
  assetTokenProgram: Address;
  foreignMint: Address;
  amount: bigint;
  slippageBps: number;
  lookupTableAddresses?: Address[];
}

export async function buildSpotBuyOperation(
  _ctx: ScriptContext,
  _args: SpotSwapArgs
): Promise<BuiltOperation> {
  throw new Error(
    "Spot buy is not migrated yet. Move logic from ../voltr-spot-scripts/src/scripts/manager-buy-spot.ts into this builder."
  );
}

export async function buildSpotSellOperation(
  _ctx: ScriptContext,
  _args: SpotSwapArgs
): Promise<BuiltOperation> {
  throw new Error(
    "Spot sell is not migrated yet. Move logic from ../voltr-spot-scripts/src/scripts/manager-sell-spot.ts into this builder."
  );
}


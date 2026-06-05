import type { Address, KeyPairSigner } from "@solana/kit";
import type { BuiltOperation, ScriptContext } from "@voltr/scripts-core";

export interface TrustfulArbitraryArgs {
  manager: KeyPairSigner;
  vault: Address;
  assetMint: Address;
  assetTokenProgram: Address;
  strategySeedString: string;
  destinationAssetTokenAccount: Address;
  amount: bigint;
  positionValueAfterDeposit?: bigint;
}

export async function buildTrustfulDepositArbitraryOperation(
  _ctx: ScriptContext,
  _args: TrustfulArbitraryArgs
): Promise<BuiltOperation> {
  throw new Error(
    "Trustful arbitrary deposit is not migrated yet. Move logic from ../voltr-trustful-scripts/src/scripts/manager-deposit-arbitrary.ts into this builder."
  );
}


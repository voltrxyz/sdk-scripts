import type { Address, KeyPairSigner } from "@solana/kit";
import type { BuiltOperation, ScriptContext } from "@voltr/scripts-core";

export interface TrustfulCurveArgs {
  manager: KeyPairSigner;
  vault: Address;
  assetMint: Address;
  assetTokenProgram: Address;
  strategySeedString: string;
  amount: bigint;
}

export async function buildTrustfulBorrowCurveOperation(
  _ctx: ScriptContext,
  _args: TrustfulCurveArgs
): Promise<BuiltOperation> {
  throw new Error(
    "Trustful curve borrow is not migrated yet. Move logic from ../voltr-trustful-scripts/src/scripts/manager-borrow-curve.ts into this builder."
  );
}

export async function buildTrustfulRepayCurveOperation(
  _ctx: ScriptContext,
  _args: TrustfulCurveArgs
): Promise<BuiltOperation> {
  throw new Error(
    "Trustful curve repay is not migrated yet. Move logic from ../voltr-trustful-scripts/src/scripts/manager-repay-curve.ts into this builder."
  );
}


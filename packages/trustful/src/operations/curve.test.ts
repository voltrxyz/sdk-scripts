import { test } from "node:test";
import { address, generateKeyPairSigner, type KeyPairSigner } from "@solana/kit";
import {
  assertBuiltOperationShape,
  createFakeScriptContext,
} from "@voltr/scripts-core/testing";
import type {
  TrustfulCurveBorrowArgs,
  TrustfulCurveRepayArgs,
} from "./curve.js";
import {
  buildTrustfulCurveBorrowOperation,
  buildTrustfulCurveRepayOperation,
} from "./curve.js";

const USDC = address("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
const TOKEN_PROGRAM = address("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const VAULT = address("11111111111111111111111111111111");

function borrowArgs(manager: KeyPairSigner): TrustfulCurveBorrowArgs {
  return {
    manager,
    vault: VAULT,
    assetMint: USDC,
    assetTokenProgram: TOKEN_PROGRAM,
    amount: 1_000_000n,
    borrowRateBps: 500,
  };
}

function repayArgs(manager: KeyPairSigner): TrustfulCurveRepayArgs {
  return {
    manager,
    vault: VAULT,
    assetMint: USDC,
    assetTokenProgram: TOKEN_PROGRAM,
    amount: 1_000_000n,
    borrowRateBps: 500,
  };
}

test("trustful:curve:borrow builds the expected operation offline", async () => {
  const ctx = createFakeScriptContext();
  const manager = await generateKeyPairSigner();
  const operation = await buildTrustfulCurveBorrowOperation(
    ctx,
    borrowArgs(manager)
  );

  assertBuiltOperationShape(operation, {
    label: "trustful:curve:borrow",
    minInstructions: 3,
  });
});

test("trustful:curve:repay builds the expected operation offline", async () => {
  const ctx = createFakeScriptContext();
  const manager = await generateKeyPairSigner();
  const operation = await buildTrustfulCurveRepayOperation(
    ctx,
    repayArgs(manager)
  );

  assertBuiltOperationShape(operation, {
    label: "trustful:curve:repay",
    minInstructions: 4,
  });
});

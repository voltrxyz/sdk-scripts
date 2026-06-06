import { test } from "node:test";
import assert from "node:assert/strict";
import { address, generateKeyPairSigner, type KeyPairSigner } from "@solana/kit";
import { createFakeScriptContext } from "@voltr/scripts-core/testing";
import type { TrustfulCurveArgs } from "./curve.js";
import {
  buildTrustfulBorrowCurveOperation,
  buildTrustfulRepayCurveOperation,
} from "./curve.js";

const USDC = address("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
const TOKEN_PROGRAM = address("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const VAULT = address("11111111111111111111111111111111");

function curveArgs(manager: KeyPairSigner): TrustfulCurveArgs {
  return {
    manager,
    vault: VAULT,
    assetMint: USDC,
    assetTokenProgram: TOKEN_PROGRAM,
    strategySeedString: "example-strategy",
    amount: 1_000_000n,
  };
}

// Smoke tests: stubs until the Trustful migration lands. They guard the exports
// + signatures and template the real tests (see comment below).
test("trustful:curve:borrow builder rejects until migrated", async () => {
  const ctx = createFakeScriptContext();
  const manager = await generateKeyPairSigner();
  await assert.rejects(
    () => buildTrustfulBorrowCurveOperation(ctx, curveArgs(manager)),
    /not migrated yet/
  );
});

test("trustful:curve:repay builder rejects until migrated", async () => {
  const ctx = createFakeScriptContext();
  const manager = await generateKeyPairSigner();
  await assert.rejects(
    () => buildTrustfulRepayCurveOperation(ctx, curveArgs(manager)),
    /not migrated yet/
  );
});

// When implemented (offline — no RPC or keypairs needed):
//
// import { assertBuiltOperationShape } from "@voltr/scripts-core/testing";
//
// test("trustful:curve:borrow builds the expected operation", async () => {
//   const ctx = createFakeScriptContext();
//   const manager = await generateKeyPairSigner();
//   const operation = await buildTrustfulBorrowCurveOperation(ctx, curveArgs(manager));
//   assertBuiltOperationShape(operation, {
//     label: "trustful:curve:borrow",
//     minInstructions: 1,
//   });
// });

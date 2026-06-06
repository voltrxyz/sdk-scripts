import { test } from "node:test";
import assert from "node:assert/strict";
import { address, generateKeyPairSigner } from "@solana/kit";
import { createFakeScriptContext } from "@voltr/scripts-core/testing";
import { buildTrustfulDepositArbitraryOperation } from "./arbitrary.js";

const USDC = address("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
const TOKEN_PROGRAM = address("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const VAULT = address("11111111111111111111111111111111");
const DESTINATION = address("So11111111111111111111111111111111111111112");

// Smoke test: stub until the Trustful migration lands. Guards the export +
// signature and templates the real test (see comment below).
test("trustful:arbitrary:deposit builder rejects until migrated", async () => {
  const ctx = createFakeScriptContext();
  const manager = await generateKeyPairSigner();

  await assert.rejects(
    () =>
      buildTrustfulDepositArbitraryOperation(ctx, {
        manager,
        vault: VAULT,
        assetMint: USDC,
        assetTokenProgram: TOKEN_PROGRAM,
        strategySeedString: "example-strategy",
        destinationAssetTokenAccount: DESTINATION,
        amount: 1_000_000n,
      }),
    /not migrated yet/
  );
});

// When implemented (offline — no RPC or keypairs needed):
//
// import { assertBuiltOperationShape } from "@voltr/scripts-core/testing";
//
// test("trustful:arbitrary:deposit builds the expected operation", async () => {
//   const ctx = createFakeScriptContext();
//   const manager = await generateKeyPairSigner();
//   const operation = await buildTrustfulDepositArbitraryOperation(ctx, { ... });
//   assertBuiltOperationShape(operation, {
//     label: "trustful:arbitrary:deposit",
//     minInstructions: 1,
//   });
// });

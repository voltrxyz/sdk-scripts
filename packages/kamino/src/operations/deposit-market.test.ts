import { test } from "node:test";
import assert from "node:assert/strict";
import { address, generateKeyPairSigner } from "@solana/kit";
import { createFakeScriptContext } from "@voltr/scripts-core/testing";
import { buildKaminoDepositMarketOperation } from "./deposit-market.js";

// Valid base58 placeholders; builders never read profile values, so the exact
// addresses are irrelevant.
const USDC = address("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
const TOKEN_PROGRAM = address("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const VAULT = address("11111111111111111111111111111111");
const RESERVE = address("So11111111111111111111111111111111111111112");

// Smoke test: the builder is a stub until the Kamino migration lands. It guards
// the export + signature and doubles as the template for the real test. When
// buildKaminoDepositMarketOperation is implemented, replace the assertion below
// with the commented `assertBuiltOperationShape` version.
test("kamino:market:deposit builder rejects until migrated", async () => {
  const ctx = createFakeScriptContext();
  const manager = await generateKeyPairSigner();

  await assert.rejects(
    () =>
      buildKaminoDepositMarketOperation(ctx, {
        manager,
        vault: VAULT,
        assetMint: USDC,
        assetTokenProgram: TOKEN_PROGRAM,
        reserve: RESERVE,
        amount: 1_000_000n,
      }),
    /not migrated yet/
  );
});

// Once the builder is implemented, swap the smoke test for an output-shape
// check (offline — no RPC or keypairs needed):
//
// import { assertBuiltOperationShape } from "@voltr/scripts-core/testing";
//
// test("kamino:market:deposit builds the expected operation", async () => {
//   const ctx = createFakeScriptContext();
//   const manager = await generateKeyPairSigner();
//   const operation = await buildKaminoDepositMarketOperation(ctx, {
//     manager,
//     vault: VAULT,
//     assetMint: USDC,
//     assetTokenProgram: TOKEN_PROGRAM,
//     reserve: RESERVE,
//     amount: 1_000_000n,
//   });
//   assertBuiltOperationShape(operation, {
//     label: "kamino:market:deposit",
//     minInstructions: 1,
//   });
// });

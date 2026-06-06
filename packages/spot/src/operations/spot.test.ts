import { test } from "node:test";
import assert from "node:assert/strict";
import { address, generateKeyPairSigner, type KeyPairSigner } from "@solana/kit";
import { createFakeScriptContext } from "@voltr/scripts-core/testing";
import type { SpotSwapArgs } from "./spot.js";
import { buildSpotBuyOperation, buildSpotSellOperation } from "./spot.js";

const USDC = address("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
const TOKEN_PROGRAM = address("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const VAULT = address("11111111111111111111111111111111");
const FOREIGN_MINT = address("So11111111111111111111111111111111111111112");

function swapArgs(manager: KeyPairSigner): SpotSwapArgs {
  return {
    manager,
    vault: VAULT,
    assetMint: USDC,
    assetTokenProgram: TOKEN_PROGRAM,
    foreignMint: FOREIGN_MINT,
    amount: 1_000_000n,
    slippageBps: 50,
  };
}

// Smoke tests: both builders are stubs until the Spot migration lands. They
// guard the exports + signatures and serve as templates — once implemented,
// replace each with an `assertBuiltOperationShape` check (see comment below).
test("spot:spot:buy builder rejects until migrated", async () => {
  const ctx = createFakeScriptContext();
  const manager = await generateKeyPairSigner();
  await assert.rejects(
    () => buildSpotBuyOperation(ctx, swapArgs(manager)),
    /not migrated yet/
  );
});

test("spot:spot:sell builder rejects until migrated", async () => {
  const ctx = createFakeScriptContext();
  const manager = await generateKeyPairSigner();
  await assert.rejects(
    () => buildSpotSellOperation(ctx, swapArgs(manager)),
    /not migrated yet/
  );
});

// When implemented (offline — no RPC or keypairs needed):
//
// import { assertBuiltOperationShape } from "@voltr/scripts-core/testing";
//
// test("spot:spot:buy builds the expected operation", async () => {
//   const ctx = createFakeScriptContext();
//   const manager = await generateKeyPairSigner();
//   const operation = await buildSpotBuyOperation(ctx, swapArgs(manager));
//   assertBuiltOperationShape(operation, {
//     label: "spot:spot:buy",
//     minInstructions: 1,
//   });
// });

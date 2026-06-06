import { test } from "node:test";
import assert from "node:assert/strict";
import { address, generateKeyPairSigner } from "@solana/kit";
import {
  assertBuiltOperationShape,
  createFakeScriptContext,
} from "@voltr/scripts-core/testing";
import { buildTrustfulArbitraryDepositOperation } from "./arbitrary.js";

const USDC = address("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
const TOKEN_PROGRAM = address("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const VAULT = address("11111111111111111111111111111111");
const DESTINATION = address("So11111111111111111111111111111111111111112");

test("trustful:arbitrary:deposit builds the expected operation offline", async () => {
  const ctx = createFakeScriptContext();
  const manager = await generateKeyPairSigner();

  const operation = await buildTrustfulArbitraryDepositOperation(ctx, {
    manager,
    vault: VAULT,
    assetMint: USDC,
    assetTokenProgram: TOKEN_PROGRAM,
    strategySeedString: "example-strategy",
    destinationAssetTokenAccount: DESTINATION,
    amount: 1_000_000n,
    positionValueAfterDeposit: 1_000_000n,
  });

  assertBuiltOperationShape(operation, {
    label: "trustful:arbitrary:deposit",
    minInstructions: 3,
  });
  assert.equal(typeof operation.metadata?.withdrawalHoldingAccount, "string");
});

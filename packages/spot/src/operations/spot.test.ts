import { test } from "node:test";
import { address, generateKeyPairSigner, type KeyPairSigner } from "@solana/kit";
import {
  assertBuiltOperationShape,
  createFakeScriptContext,
} from "@voltr/scripts-core/testing";
import type { SpotSpotSwapArgs } from "./spot.js";
import { buildSpotSpotBuyOperation, buildSpotSpotSellOperation } from "./spot.js";

const USDC = address("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
const TOKEN_PROGRAM = address("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const VAULT = address("11111111111111111111111111111111");
const FOREIGN_MINT = address("So11111111111111111111111111111111111111112");
const ASSET_ORACLE = address("ComputeBudget111111111111111111111111111111");
const FOREIGN_ORACLE = address("AddressLookupTab1e1111111111111111111111111");

function swapArgs(manager: KeyPairSigner): SpotSpotSwapArgs {
  return {
    manager,
    vault: VAULT,
    assetMint: USDC,
    assetTokenProgram: TOKEN_PROGRAM,
    foreignMint: FOREIGN_MINT,
    foreignTokenProgram: TOKEN_PROGRAM,
    assetOracle: ASSET_ORACLE,
    foreignOracle: FOREIGN_ORACLE,
    amount: 0n,
    slippageBps: 50,
    jupiterMaxAccounts: 16,
  };
}

test("spot:spot:buy builds the expected operation offline", async () => {
  const ctx = createFakeScriptContext();
  const manager = await generateKeyPairSigner();
  const operation = await buildSpotSpotBuyOperation(ctx, swapArgs(manager));

  assertBuiltOperationShape(operation, {
    label: "spot:spot:buy",
    minInstructions: 3,
  });
});

test("spot:spot:sell builds the expected operation offline", async () => {
  const ctx = createFakeScriptContext();
  const manager = await generateKeyPairSigner();
  const operation = await buildSpotSpotSellOperation(ctx, swapArgs(manager));

  assertBuiltOperationShape(operation, {
    label: "spot:spot:sell",
    minInstructions: 3,
  });
});

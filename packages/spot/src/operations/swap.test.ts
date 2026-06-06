import { test } from "node:test";
import { address, generateKeyPairSigner, type KeyPairSigner } from "@solana/kit";
import {
  assertBuiltOperationShape,
  createFakeScriptContext,
} from "@voltr/scripts-core/testing";
import type { SpotSwapArgs } from "./swap.js";
import { buildSpotSwapBuyOperation, buildSpotSwapSellOperation } from "./swap.js";

const USDC = address("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
const TOKEN_PROGRAM = address("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const VAULT = address("11111111111111111111111111111111");
const FOREIGN_MINT = address("So11111111111111111111111111111111111111112");
const ASSET_ORACLE = address("ComputeBudget111111111111111111111111111111");
const FOREIGN_ORACLE = address("AddressLookupTab1e1111111111111111111111111");

function swapArgs(manager: KeyPairSigner): SpotSwapArgs {
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

test("spot:swap:buy builds the expected operation offline", async () => {
  const ctx = createFakeScriptContext();
  const manager = await generateKeyPairSigner();
  const operation = await buildSpotSwapBuyOperation(ctx, swapArgs(manager));

  assertBuiltOperationShape(operation, {
    label: "spot:swap:buy",
    minInstructions: 3,
  });
});

test("spot:swap:sell builds the expected operation offline", async () => {
  const ctx = createFakeScriptContext();
  const manager = await generateKeyPairSigner();
  const operation = await buildSpotSwapSellOperation(ctx, swapArgs(manager));

  assertBuiltOperationShape(operation, {
    label: "spot:swap:sell",
    minInstructions: 3,
  });
});

import { test } from "node:test";
import { address, generateKeyPairSigner } from "@solana/kit";
import {
  assertBuiltOperationShape,
  createFakeScriptContext,
} from "@voltr/scripts-core/testing";
import { buildKaminoKvaultInitOperation } from "./kvault.js";

// Valid base58 placeholders; builders never read profile values, so the exact
// addresses are irrelevant.
const USDC = address("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
const TOKEN_PROGRAM = address("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const VAULT = address("11111111111111111111111111111111");
const KVAULT = address("So11111111111111111111111111111111111111112");

// `kamino:kvault:init` derives all of its accounts from PDAs (no on-chain reserve
// decode), so its output shape is fully checkable offline. The reserve-backed
// builders (market:*, kvault:deposit/withdraw) need decoded klend state, which is
// out of scope for the no-network fake RPC — see market.test.ts.
test("kamino:kvault:init builds the expected operation offline", async () => {
  const ctx = createFakeScriptContext();
  const manager = await generateKeyPairSigner();

  const operation = await buildKaminoKvaultInitOperation(ctx, {
    manager,
    vault: VAULT,
    assetMint: USDC,
    assetTokenProgram: TOKEN_PROGRAM,
    kvault: KVAULT,
  });

  assertBuiltOperationShape(operation, {
    label: "kamino:kvault:init",
    minInstructions: 1,
  });
});

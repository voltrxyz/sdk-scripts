import { test } from "node:test";
import assert from "node:assert/strict";
import { address, generateKeyPairSigner } from "@solana/kit";
import { createFakeScriptContext } from "@voltr/scripts-core/testing";
import { buildKaminoMarketDepositOperation } from "./market.js";

const USDC = address("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
const TOKEN_PROGRAM = address("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const VAULT = address("11111111111111111111111111111111");
const RESERVE = address("So11111111111111111111111111111111111111112");

// The market builders decode the klend `Reserve` account to derive their
// remaining accounts, so a full output-shape assertion needs real on-chain bytes
// (out of scope for the offline fake RPC). This test pins the package-boundary
// behavior we *can* check offline: when the reserve account is absent, the
// builder fails fast with an actionable error rather than producing a malformed
// instruction.
test("kamino:market:deposit rejects with a clear error when the reserve is missing", async () => {
  const ctx = createFakeScriptContext();
  const manager = await generateKeyPairSigner();

  await assert.rejects(
    () =>
      buildKaminoMarketDepositOperation(ctx, {
        manager,
        vault: VAULT,
        assetMint: USDC,
        assetTokenProgram: TOKEN_PROGRAM,
        reserve: RESERVE,
        amount: 1_000_000n,
      }),
    /reserve account .* was not found/
  );
});

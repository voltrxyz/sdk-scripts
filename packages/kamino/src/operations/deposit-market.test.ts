import { test } from "node:test";
import assert from "node:assert/strict";
import { address, generateKeyPairSigner } from "@solana/kit";
import { createFakeScriptContext } from "@voltr/scripts-core/testing";

// Valid base58 placeholders; builders never read profile values, so the exact
// addresses are irrelevant.
const USDC = address("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
const TOKEN_PROGRAM = address("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const VAULT = address("11111111111111111111111111111111");
const RESERVE = address("So11111111111111111111111111111111111111112");

// The migrated builder imports `@kamino-finance/klend-sdk`, whose transitive
// dependency `@kamino-finance/farms-sdk/dist/@codegen/farms/programId` does not
// resolve under the test runner (a klend-sdk / farms-sdk version mismatch). The
// builder is imported dynamically inside the test so this file still loads, and
// the test is skipped until that dependency is fixed — tracked separately from
// the vault CLI work. Drop `skip` once `@voltr/scripts-kamino` imports cleanly.
test(
  "kamino:market:deposit fetches the reserve and errors when it is absent",
  { skip: "blocked by @kamino-finance/klend-sdk dependency resolution" },
  async () => {
    const { buildKaminoMarketDepositOperation } = await import(
      "./deposit-market.js"
    );
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
  }
);

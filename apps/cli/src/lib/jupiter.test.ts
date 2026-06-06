import { test } from "node:test";
import assert from "node:assert/strict";
import { address, readonlyAccount, writableAccount } from "@voltr/scripts-core";
import { setupKaminoRewardSwap } from "./jupiter.js";

const AUTHORITY = address("BPFLoaderUpgradeab1e11111111111111111111111");
const USDC = address("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
const REWARD = address("So11111111111111111111111111111111111111112");
const JUPITER = address("JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4");
const LUT = address("AddressLookupTab1e1111111111111111111111111");

/** Builds a fake `fetch` that routes `/quote` and `/swap-instructions` requests. */
function makeFetch(quote: unknown, swap: unknown): typeof fetch {
  return (async (input: unknown) => {
    const url = String(input);
    const body = url.includes("/quote") ? quote : swap;
    return { json: async () => body } as Response;
  }) as unknown as typeof fetch;
}

const baseParams = {
  authority: AUTHORITY,
  rewardMint: REWARD,
  assetMint: USDC,
  slippageBps: 50,
  maxAccounts: 18,
};

test("setupKaminoRewardSwap skips the swap when swapAmount is zero", async () => {
  const result = await setupKaminoRewardSwap({
    ...baseParams,
    swapAmount: 0n,
    fetchFn: (() => {
      throw new Error("fetch should not be called for a zero amount");
    }) as unknown as typeof fetch,
  });
  assert.equal(result, undefined);
});

test("setupKaminoRewardSwap skips the swap when reward already equals the asset", async () => {
  const result = await setupKaminoRewardSwap({
    ...baseParams,
    rewardMint: USDC,
    swapAmount: 1_000n,
    fetchFn: (() => {
      throw new Error("fetch should not be called when reward == asset");
    }) as unknown as typeof fetch,
  });
  assert.equal(result, undefined);
});

test("setupKaminoRewardSwap shapes the KaminoJupiterSwap payload", async () => {
  const swapData = new Uint8Array([1, 2, 3, 4, 5]);
  const result = await setupKaminoRewardSwap({
    ...baseParams,
    swapAmount: 1_000n,
    fetchFn: makeFetch(
      { otherAmountThreshold: "990" },
      {
        swapInstruction: {
          programId: JUPITER,
          accounts: [
            { pubkey: USDC, isSigner: false, isWritable: true },
            // Jupiter may flag an account as a signer; the adaptor signs via a
            // PDA, so every remaining account must be forced non-signer.
            { pubkey: REWARD, isSigner: true, isWritable: false },
          ],
          data: Buffer.from(swapData).toString("base64"),
        },
        addressLookupTableAddresses: [LUT],
      }
    ),
  });

  assert.ok(result);
  assert.deepEqual(result.swapAccounts, [
    readonlyAccount(JUPITER),
    writableAccount(USDC),
    readonlyAccount(REWARD),
  ]);
  assert.deepEqual(result.swapInstructionData, swapData);
  assert.deepEqual(result.lookupTableAddresses, [LUT]);
});

test("setupKaminoRewardSwap surfaces a quote error", async () => {
  await assert.rejects(
    () =>
      setupKaminoRewardSwap({
        ...baseParams,
        swapAmount: 1_000n,
        fetchFn: makeFetch({ error: "no route found" }, {}),
      }),
    /Jupiter quote failed: no route found/
  );
});

test("setupKaminoRewardSwap surfaces a swap-instructions error", async () => {
  await assert.rejects(
    () =>
      setupKaminoRewardSwap({
        ...baseParams,
        swapAmount: 1_000n,
        fetchFn: makeFetch({}, { error: "cannot build" }),
      }),
    /Failed to get swap instructions: cannot build/
  );
});

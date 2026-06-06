import { test } from "node:test";
import assert from "node:assert/strict";
import { AccountRole, address } from "@solana/kit";
import { setupJupiterSwap } from "./jupiter.js";

const AUTHORITY = address("BPFLoaderUpgradeab1e11111111111111111111111");
const USDC = address("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
const SOL = address("So11111111111111111111111111111111111111112");
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
  inputMint: USDC,
  outputMint: SOL,
  slippageBps: 50,
  maxAccounts: 16,
};

test("setupJupiterSwap skips the swap when amountIn is zero", async () => {
  const result = await setupJupiterSwap({
    ...baseParams,
    amountIn: 0n,
    minimumThresholdAmountOut: 0n,
    fetchFn: (() => {
      throw new Error("fetch should not be called for a zero amount");
    }) as unknown as typeof fetch,
  });

  assert.deepEqual(result.remainingAccounts, []);
  assert.equal(result.additionalArgs.length, 0);
  assert.deepEqual(result.lookupTableAddresses, []);
});

test("setupJupiterSwap shapes remaining accounts, args, and LUTs", async () => {
  const swapData = new Uint8Array([1, 2, 3, 4, 5]);
  const result = await setupJupiterSwap({
    ...baseParams,
    amountIn: 1_000n,
    minimumThresholdAmountOut: 500n,
    fetchFn: makeFetch(
      { otherAmountThreshold: "1000" },
      {
        swapInstruction: {
          programId: JUPITER,
          accounts: [
            { pubkey: USDC, isSigner: false, isWritable: true },
            // Jupiter may flag an account as a signer; the adaptor signs via a
            // PDA, so every remaining account must be forced non-signer.
            { pubkey: SOL, isSigner: true, isWritable: false },
          ],
          data: Buffer.from(swapData).toString("base64"),
        },
        addressLookupTableAddresses: [LUT],
      }
    ),
  });

  assert.deepEqual(result.remainingAccounts, [
    { address: JUPITER, role: AccountRole.READONLY },
    { address: USDC, role: AccountRole.WRITABLE },
    { address: SOL, role: AccountRole.READONLY },
  ]);
  assert.deepEqual(result.additionalArgs, swapData);
  assert.deepEqual(result.lookupTableAddresses, [LUT]);
});

test("setupJupiterSwap rejects when the quote threshold is too low", async () => {
  await assert.rejects(
    () =>
      setupJupiterSwap({
        ...baseParams,
        amountIn: 1_000n,
        minimumThresholdAmountOut: 5_000n,
        fetchFn: makeFetch({ otherAmountThreshold: "1000" }, {}),
      }),
    /otherAmountThreshold is too low/
  );
});

test("setupJupiterSwap surfaces a quote error", async () => {
  await assert.rejects(
    () =>
      setupJupiterSwap({
        ...baseParams,
        amountIn: 1_000n,
        minimumThresholdAmountOut: 0n,
        fetchFn: makeFetch({ error: "no route found" }, {}),
      }),
    /Jupiter quote failed: no route found/
  );
});

test("setupJupiterSwap surfaces a swap-instructions error", async () => {
  await assert.rejects(
    () =>
      setupJupiterSwap({
        ...baseParams,
        amountIn: 1_000n,
        minimumThresholdAmountOut: 0n,
        fetchFn: makeFetch(
          { otherAmountThreshold: "1000" },
          { error: "cannot build" }
        ),
      }),
    /Failed to get swap instructions: cannot build/
  );
});

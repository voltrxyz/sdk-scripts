/**
 * trustful:curve-borrow — borrow against the Trustful curve strategy.
 *
 * Run:   pnpm exec tsx examples/src/trustful/curve-borrow.ts   (or: pnpm example -- trustful:curve-borrow)
 * Needs: profile vault.*; MANAGER_KEYPAIR.
 * Mode:  defaults to print (--mode execute / VOLTR_MODE=execute to send).
 */
import { buildTrustfulCurveBorrowOperation } from "@voltr/scripts-trustful";
import {
  requireAssetMint,
  requireAssetTokenProgram,
  requireVaultAddress,
  resolveLookupTableAddresses,
} from "@voltr/scripts-core";
import { defineExample, runIfMain } from "../shared/harness.js";

// --- edit for your run ---
const AMOUNT = 1_000_000n; // raw asset amount to borrow, smallest units
const BORROW_RATE_BPS = 500; // borrow rate in basis points
// -------------------------

const example = defineExample("trustful:curve-borrow", async (h) => {
  const manager = await h.signer("manager");
  const operation = await buildTrustfulCurveBorrowOperation(h.ctx, {
    manager,
    vault: requireVaultAddress(h.profile),
    assetMint: requireAssetMint(h.profile),
    assetTokenProgram: requireAssetTokenProgram(h.profile),
    amount: AMOUNT,
    borrowRateBps: BORROW_RATE_BPS,
    lookupTableAddresses: resolveLookupTableAddresses(h.profile),
  });
  await h.process(operation, manager);
});

export default example;

await runIfMain(import.meta.url, example);

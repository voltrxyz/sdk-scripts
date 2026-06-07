/**
 * spot:earn-withdraw — withdraw the vault asset from the Jupiter Earn strategy.
 * Derives accounts from PDAs (offline-capable).
 *
 * Run:   pnpm exec tsx examples/src/spot/earn-withdraw.ts   (or: pnpm example -- spot:earn-withdraw)
 * Needs: profile vault.*; MANAGER_KEYPAIR.
 * Mode:  defaults to print (--mode execute / VOLTR_MODE=execute to send).
 */
import { buildSpotEarnWithdrawOperation } from "@voltr/scripts-spot";
import {
  requireAssetMint,
  requireAssetTokenProgram,
  requireVaultAddress,
  resolveLookupTableAddresses,
} from "@voltr/scripts-core";
import { defineExample, runIfMain } from "../shared/harness.js";

// --- edit for your run ---
const AMOUNT = 1_000_000n; // raw asset amount, smallest units
// -------------------------

const example = defineExample("spot:earn-withdraw", async (h) => {
  const manager = await h.signer("manager");
  const operation = await buildSpotEarnWithdrawOperation(h.ctx, {
    manager,
    vault: requireVaultAddress(h.profile),
    assetMint: requireAssetMint(h.profile),
    assetTokenProgram: requireAssetTokenProgram(h.profile),
    amount: AMOUNT,
    lookupTableAddresses: resolveLookupTableAddresses(h.profile),
  });
  await h.process(operation, manager);
});

export default example;

await runIfMain(import.meta.url, example);

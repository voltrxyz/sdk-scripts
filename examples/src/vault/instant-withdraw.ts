/**
 * vault:instant-withdraw — redeem LP directly against the vault's idle assets in
 * a single transaction (no request/claim cycle).
 *
 * Run:   pnpm exec tsx examples/src/vault/instant-withdraw.ts   (or: pnpm example -- vault:instant-withdraw)
 * Needs: profile vault.vaultAddress + asset fields; USER_KEYPAIR.
 * Mode:  defaults to print (--mode execute / VOLTR_MODE=execute to send).
 */
import {
  buildInstantWithdrawVaultOperation,
  requireAssetMint,
  requireAssetTokenProgram,
  requireVaultAddress,
  resolveLookupTableAddresses,
} from "@voltr/scripts-core";
import { defineExample, runIfMain } from "../shared/harness.js";

// --- edit for your run ---
const AMOUNT = 1_000_000n; // raw amount (LP units when IN_LP is true)
const IN_LP = false; // interpret AMOUNT as LP tokens instead of asset units
const WITHDRAW_ALL = false; // withdraw the entire position (overrides AMOUNT)
// -------------------------

const example = defineExample("vault:instant-withdraw", async (h) => {
  const user = await h.signer("user");
  const operation = await buildInstantWithdrawVaultOperation(h.ctx, {
    user,
    vault: requireVaultAddress(h.profile),
    assetMint: requireAssetMint(h.profile),
    assetTokenProgram: requireAssetTokenProgram(h.profile),
    amount: AMOUNT,
    isAmountInLp: IN_LP,
    isWithdrawAll: WITHDRAW_ALL,
    lookupTableAddresses: resolveLookupTableAddresses(h.profile),
  });
  await h.process(operation, user);
});

export default example;

await runIfMain(import.meta.url, example);

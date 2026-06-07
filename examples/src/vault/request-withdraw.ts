/**
 * vault:request-withdraw — request a withdrawal from the vault.
 *
 * Only one request can be outstanding per user per vault. Claim it later with
 * vault/withdraw.ts once any waiting period has passed.
 *
 * Run:   pnpm exec tsx examples/src/vault/request-withdraw.ts   (or: pnpm example -- vault:request-withdraw)
 * Needs: profile vault.vaultAddress; USER_KEYPAIR.
 * Mode:  defaults to print (--mode execute / VOLTR_MODE=execute to send).
 */
import {
  buildRequestWithdrawVaultOperation,
  requireVaultAddress,
  resolveLookupTableAddresses,
} from "@voltr/scripts-core";
import { defineExample, runIfMain } from "../shared/harness.js";

// --- edit for your run ---
const AMOUNT = 1_000_000n; // raw amount to request (LP units when IN_LP is true)
const IN_LP = false; // interpret AMOUNT as LP tokens instead of asset units
const WITHDRAW_ALL = false; // request the entire position (overrides AMOUNT)
// -------------------------

const example = defineExample("vault:request-withdraw", async (h) => {
  const user = await h.signer("user");
  const operation = await buildRequestWithdrawVaultOperation(h.ctx, {
    user,
    vault: requireVaultAddress(h.profile),
    amount: AMOUNT,
    isAmountInLp: IN_LP,
    isWithdrawAll: WITHDRAW_ALL,
    lookupTableAddresses: resolveLookupTableAddresses(h.profile),
  });
  await h.process(operation, user);
});

export default example;

await runIfMain(import.meta.url, example);

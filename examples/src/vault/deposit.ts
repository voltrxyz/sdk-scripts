/**
 * vault:deposit — deposit the profile asset into the vault.
 *
 * Run:   pnpm exec tsx examples/src/vault/deposit.ts   (or: pnpm example -- vault:deposit)
 * Needs: profile vault.vaultAddress + asset fields; USER_KEYPAIR.
 * Mode:  defaults to print (--mode execute / VOLTR_MODE=execute to send).
 */
import {
  buildDepositVaultOperation,
  requireAssetMint,
  requireAssetTokenProgram,
  requireVaultAddress,
  resolveLookupTableAddresses,
} from "@voltr/scripts-core";
import { defineExample, runIfMain } from "../shared/harness.js";

// --- edit for your run ---
const AMOUNT = 1_000_000n; // raw asset amount, smallest units (USDC: 1_000_000 = 1 USDC)
// -------------------------

const example = defineExample("vault:deposit", async (h) => {
  const user = await h.signer("user");
  const operation = await buildDepositVaultOperation(h.ctx, {
    user,
    vault: requireVaultAddress(h.profile),
    assetMint: requireAssetMint(h.profile),
    assetTokenProgram: requireAssetTokenProgram(h.profile),
    amount: AMOUNT,
    lookupTableAddresses: resolveLookupTableAddresses(h.profile),
  });
  await h.process(operation, user);
});

export default example;

await runIfMain(import.meta.url, example);

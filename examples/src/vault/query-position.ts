/**
 * vault:query-position — read a user's vault position (read-only).
 *
 * Prints the user's LP balance and withdrawable asset value (before and after
 * fees). Read-only: no keypair, mode is ignored, but a working RPC is required.
 *
 * Run:   pnpm exec tsx examples/src/vault/query-position.ts   (or: pnpm example -- vault:query-position)
 * Needs: profile vault.vaultAddress; RPC_URL.
 */
import {
  address,
  queryVaultPosition,
  requireVaultAddress,
} from "@voltr/scripts-core";
import { defineExample, runIfMain } from "../shared/harness.js";

// --- edit for your run ---
const USER = address("So11111111111111111111111111111111111111112"); // address to read
// -------------------------

const example = defineExample("vault:query-position", async (h) => {
  const snapshot = await queryVaultPosition(h.ctx, {
    user: USER,
    vault: requireVaultAddress(h.profile),
  });
  h.json(snapshot);
});

export default example;

await runIfMain(import.meta.url, example);

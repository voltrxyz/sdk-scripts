/**
 * vault:query-strategy-positions — read the vault's per-strategy allocation
 * (read-only).
 *
 * Prints the vault's total value and each strategy's position value. Read-only:
 * no keypair, mode is ignored, but a working RPC is required.
 *
 * Run:   pnpm exec tsx examples/src/vault/query-strategy-positions.ts   (or: pnpm example -- vault:query-strategy-positions)
 * Needs: profile vault.vaultAddress; RPC_URL.
 */
import {
  queryStrategyPositions,
  requireVaultAddress,
} from "@voltr/scripts-core";
import { defineExample, runIfMain } from "../shared/harness.js";

const example = defineExample("vault:query-strategy-positions", async (h) => {
  const snapshot = await queryStrategyPositions(h.ctx, {
    vault: requireVaultAddress(h.profile),
  });
  h.json(snapshot);
});

export default example;

await runIfMain(import.meta.url, example);

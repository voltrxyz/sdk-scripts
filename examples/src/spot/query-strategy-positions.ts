/**
 * spot:query-strategy-positions — read the vault's Spot/Earn strategy positions
 * (read-only). Each allocation is augmented with the strategy's current raw
 * foreign-token balance where it is backed by a token mint.
 *
 * Run:   pnpm exec tsx examples/src/spot/query-strategy-positions.ts   (or: pnpm example -- spot:query-strategy-positions)
 * Needs: profile vault.vaultAddress; RPC_URL. No keypair; mode ignored.
 */
import { requireVaultAddress } from "@voltr/scripts-core";
import { querySpotStrategyPositions } from "@voltr/scripts-spot";
import { defineExample, runIfMain } from "../shared/harness.js";

const example = defineExample("spot:query-strategy-positions", async (h) => {
  const snapshot = await querySpotStrategyPositions(h.ctx, {
    vault: requireVaultAddress(h.profile),
  });
  h.json(snapshot);
});

export default example;

await runIfMain(import.meta.url, example);

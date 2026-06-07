/**
 * spot:swap-buy — buy the foreign asset with the vault asset via a Jupiter spot
 * swap. AMOUNT is the vault-asset input.
 *
 * Run:   pnpm exec tsx examples/src/spot/swap-buy.ts   (or: pnpm example -- spot:swap-buy)
 * Needs: profile vault.* + integrations.spot.*; MANAGER_KEYPAIR.
 *        Fetches a Jupiter quote over HTTP in every mode including print.
 * Mode:  defaults to print (--mode execute / VOLTR_MODE=execute to send).
 */
import { buildSpotSwapBuyOperation } from "@voltr/scripts-spot";
import {
  requireAssetMint,
  requireAssetTokenProgram,
  requireSpotIntegration,
  requireVaultAddress,
  resolveLookupTableAddresses,
} from "@voltr/scripts-core";
import { defineExample, runIfMain } from "../shared/harness.js";

// --- edit for your run ---
const AMOUNT = 1_000_000n; // raw vault-asset input, smallest units
const SLIPPAGE_BPS = 50;
const JUPITER_MAX_ACCOUNTS = 16;
// -------------------------

const example = defineExample("spot:swap-buy", async (h) => {
  const manager = await h.signer("manager");
  const spot = requireSpotIntegration(h.profile);
  const operation = await buildSpotSwapBuyOperation(h.ctx, {
    manager,
    vault: requireVaultAddress(h.profile),
    assetMint: requireAssetMint(h.profile),
    assetTokenProgram: requireAssetTokenProgram(h.profile),
    foreignMint: spot.foreignMint,
    foreignTokenProgram: spot.foreignTokenProgram,
    assetOracle: spot.assetOracle,
    foreignOracle: spot.foreignOracle,
    amount: AMOUNT,
    slippageBps: SLIPPAGE_BPS,
    jupiterMaxAccounts: JUPITER_MAX_ACCOUNTS,
    lookupTableAddresses: resolveLookupTableAddresses(h.profile),
  });
  await h.process(operation, manager);
});

export default example;

await runIfMain(import.meta.url, example);

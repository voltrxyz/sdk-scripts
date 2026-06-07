/**
 * spot:swap-sell — sell the foreign asset back to the vault asset via a Jupiter
 * spot swap. AMOUNT is the foreign-asset input. Symmetric with spot/swap-buy.ts.
 *
 * Run:   pnpm exec tsx examples/src/spot/swap-sell.ts   (or: pnpm example -- spot:swap-sell)
 * Needs: profile vault.* + integrations.spot.*; MANAGER_KEYPAIR.
 *        Fetches a Jupiter quote over HTTP in every mode including print.
 * Mode:  defaults to print (--mode execute / VOLTR_MODE=execute to send).
 */
import { buildSpotSwapSellOperation } from "@voltr/scripts-spot";
import {
  requireAssetMint,
  requireAssetTokenProgram,
  requireSpotIntegration,
  requireVaultAddress,
  resolveLookupTableAddresses,
} from "@voltr/scripts-core";
import { defineExample, runIfMain } from "../shared/harness.js";

// --- edit for your run ---
const AMOUNT = 1_000_000n; // raw foreign-asset input, smallest units
const SLIPPAGE_BPS = 50;
const JUPITER_MAX_ACCOUNTS = 16;
// -------------------------

const example = defineExample("spot:swap-sell", async (h) => {
  const manager = await h.signer("manager");
  const spot = requireSpotIntegration(h.profile);
  const operation = await buildSpotSwapSellOperation(h.ctx, {
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

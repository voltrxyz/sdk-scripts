/**
 * spot:swap-init — initialize a Spot swap strategy (its id is the foreign mint):
 * creates the strategy auth's asset + foreign token accounts and registers both
 * Pyth oracle init receipts.
 *
 * Run:   pnpm exec tsx examples/src/spot/swap-init.ts   (or: pnpm example -- spot:swap-init)
 * Needs: profile vault.* + the full integrations.spot section; MANAGER_KEYPAIR.
 * Mode:  defaults to print (--mode execute / VOLTR_MODE=execute to send).
 */
import { buildSpotSwapInitOperation } from "@voltr/scripts-spot";
import {
  requireAssetMint,
  requireAssetTokenProgram,
  requireSpotIntegration,
  requireVaultAddress,
  resolveLookupTableAddresses,
} from "@voltr/scripts-core";
import { defineExample, runIfMain } from "../shared/harness.js";

const example = defineExample("spot:swap-init", async (h) => {
  const manager = await h.signer("manager");
  const spot = requireSpotIntegration(h.profile);
  const operation = await buildSpotSwapInitOperation(h.ctx, {
    manager,
    vault: requireVaultAddress(h.profile),
    assetMint: requireAssetMint(h.profile),
    assetTokenProgram: requireAssetTokenProgram(h.profile),
    foreignMint: spot.foreignMint,
    foreignTokenProgram: spot.foreignTokenProgram,
    assetOracle: spot.assetOracle,
    foreignOracle: spot.foreignOracle,
    lookupTableAddresses: resolveLookupTableAddresses(h.profile),
  });
  await h.process(operation, manager);
});

export default example;

await runIfMain(import.meta.url, example);

/**
 * spot:earn-extend-lut — extend the profile's lookup table with every account
 * the Jupiter Earn transactions touch, so they fit transaction size limits. Run
 * after spot/earn-init.ts when the vault uses a lookup table.
 *
 * Run:   pnpm exec tsx examples/src/spot/earn-extend-lut.ts   (or: pnpm example -- spot:earn-extend-lut)
 * Needs: profile vault.* + vault.lookupTableAddress (vault.useLookupTable true);
 *        MANAGER_KEYPAIR (the lookup-table authority + payer). Reads the LUT via RPC.
 * Mode:  defaults to print (--mode execute / VOLTR_MODE=execute to send).
 */
import { buildSpotEarnExtendLutOperation } from "@voltr/scripts-spot";
import {
  requireAssetMint,
  requireAssetTokenProgram,
  requireLookupTableAddress,
  requireVaultAddress,
} from "@voltr/scripts-core";
import { defineExample, runIfMain } from "../shared/harness.js";

const example = defineExample("spot:earn-extend-lut", async (h) => {
  const manager = await h.signer("manager");
  const operation = await buildSpotEarnExtendLutOperation(h.ctx, {
    manager,
    vault: requireVaultAddress(h.profile),
    assetMint: requireAssetMint(h.profile),
    assetTokenProgram: requireAssetTokenProgram(h.profile),
    lookupTable: requireLookupTableAddress(h.profile),
  });
  await h.process(operation, manager);
});

export default example;

await runIfMain(import.meta.url, example);

/**
 * spot:earn-init — initialize the Jupiter Earn (lending) strategy for the vault
 * asset: creates the strategy auth's asset + fToken token accounts. Run
 * spot/earn-extend-lut.ts afterwards if the vault uses a lookup table.
 *
 * Run:   pnpm exec tsx examples/src/spot/earn-init.ts   (or: pnpm example -- spot:earn-init)
 * Needs: profile vault.*; MANAGER_KEYPAIR.
 * Mode:  defaults to print (--mode execute / VOLTR_MODE=execute to send).
 */
import { buildSpotEarnInitOperation } from "@voltr/scripts-spot";
import {
  requireAssetMint,
  requireAssetTokenProgram,
  requireVaultAddress,
  resolveLookupTableAddresses,
} from "@voltr/scripts-core";
import { defineExample, runIfMain } from "../shared/harness.js";

const example = defineExample("spot:earn-init", async (h) => {
  const manager = await h.signer("manager");
  const operation = await buildSpotEarnInitOperation(h.ctx, {
    manager,
    vault: requireVaultAddress(h.profile),
    assetMint: requireAssetMint(h.profile),
    assetTokenProgram: requireAssetTokenProgram(h.profile),
    lookupTableAddresses: resolveLookupTableAddresses(h.profile),
  });
  await h.process(operation, manager);
});

export default example;

await runIfMain(import.meta.url, example);

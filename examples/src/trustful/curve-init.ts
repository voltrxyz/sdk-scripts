/**
 * trustful:curve-init — initialize the per-vault Trustful curve strategy
 * (a singleton seeded by the adaptor's fixed "curve" constant; no seed needed).
 *
 * Run:   pnpm exec tsx examples/src/trustful/curve-init.ts   (or: pnpm example -- trustful:curve-init)
 * Needs: profile vault.*; MANAGER_KEYPAIR.
 * Mode:  defaults to print (--mode execute / VOLTR_MODE=execute to send).
 */
import { buildTrustfulCurveInitOperation } from "@voltr/scripts-trustful";
import {
  requireAssetMint,
  requireAssetTokenProgram,
  requireVaultAddress,
  resolveLookupTableAddresses,
} from "@voltr/scripts-core";
import { defineExample, runIfMain } from "../shared/harness.js";

const example = defineExample("trustful:curve-init", async (h) => {
  const manager = await h.signer("manager");
  const operation = await buildTrustfulCurveInitOperation(h.ctx, {
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

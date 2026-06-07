/**
 * trustful:arbitrary-init — initialize a Trustful arbitrary strategy named by
 * integrations.trustful.strategySeedString.
 *
 * Run:   pnpm exec tsx examples/src/trustful/arbitrary-init.ts   (or: pnpm example -- trustful:arbitrary-init)
 * Needs: profile vault.* + integrations.trustful.strategySeedString; MANAGER_KEYPAIR.
 * Mode:  defaults to print (--mode execute / VOLTR_MODE=execute to send).
 */
import { buildTrustfulArbitraryInitOperation } from "@voltr/scripts-trustful";
import {
  requireAssetMint,
  requireAssetTokenProgram,
  requireTrustfulIntegration,
  requireVaultAddress,
  resolveLookupTableAddresses,
} from "@voltr/scripts-core";
import { defineExample, runIfMain } from "../shared/harness.js";

const example = defineExample("trustful:arbitrary-init", async (h) => {
  const manager = await h.signer("manager");
  const operation = await buildTrustfulArbitraryInitOperation(h.ctx, {
    manager,
    vault: requireVaultAddress(h.profile),
    assetMint: requireAssetMint(h.profile),
    assetTokenProgram: requireAssetTokenProgram(h.profile),
    strategySeedString: requireTrustfulIntegration(h.profile).strategySeedString,
    lookupTableAddresses: resolveLookupTableAddresses(h.profile),
  });
  await h.process(operation, manager);
});

export default example;

await runIfMain(import.meta.url, example);

/**
 * kamino:kvault-init — initialize a Voltr strategy backed by a Kamino vault
 * (kvault). The kvault is the strategy id. Builds from PDAs (offline-capable).
 *
 * Run:   pnpm exec tsx examples/src/kamino/kvault-init.ts   (or: pnpm example -- kamino:kvault-init)
 * Needs: profile vault.* + integrations.kamino.kvaultAddress; MANAGER_KEYPAIR.
 * Mode:  defaults to print (--mode execute / VOLTR_MODE=execute to send).
 */
import { buildKaminoKvaultInitOperation } from "@voltr/scripts-kamino";
import {
  requireAssetMint,
  requireAssetTokenProgram,
  requireKaminoKvault,
  requireVaultAddress,
  resolveLookupTableAddresses,
} from "@voltr/scripts-core";
import { defineExample, runIfMain } from "../shared/harness.js";

const example = defineExample("kamino:kvault-init", async (h) => {
  const manager = await h.signer("manager");
  const operation = await buildKaminoKvaultInitOperation(h.ctx, {
    manager,
    vault: requireVaultAddress(h.profile),
    assetMint: requireAssetMint(h.profile),
    assetTokenProgram: requireAssetTokenProgram(h.profile),
    kvault: requireKaminoKvault(h.profile),
    lookupTableAddresses: resolveLookupTableAddresses(h.profile),
  });
  await h.process(operation, manager);
});

export default example;

await runIfMain(import.meta.url, example);

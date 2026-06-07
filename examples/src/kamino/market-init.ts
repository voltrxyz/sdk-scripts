/**
 * kamino:market-init — initialize a Voltr strategy backed by a Kamino lending
 * market (klend reserve). The reserve is the strategy id.
 *
 * Run:   pnpm exec tsx examples/src/kamino/market-init.ts   (or: pnpm example -- kamino:market-init)
 * Needs: profile vault.* + integrations.kamino.reserveAddress; MANAGER_KEYPAIR.
 *        Decodes the on-chain reserve — needs a working RPC even in print mode.
 * Mode:  defaults to print (--mode execute / VOLTR_MODE=execute to send).
 */
import { buildKaminoMarketInitOperation } from "@voltr/scripts-kamino";
import {
  requireAssetMint,
  requireAssetTokenProgram,
  requireKaminoReserve,
  requireVaultAddress,
  resolveLookupTableAddresses,
} from "@voltr/scripts-core";
import { defineExample, runIfMain } from "../shared/harness.js";

const example = defineExample("kamino:market-init", async (h) => {
  const manager = await h.signer("manager");
  const operation = await buildKaminoMarketInitOperation(h.ctx, {
    manager,
    vault: requireVaultAddress(h.profile),
    assetMint: requireAssetMint(h.profile),
    assetTokenProgram: requireAssetTokenProgram(h.profile),
    reserve: requireKaminoReserve(h.profile),
    lookupTableAddresses: resolveLookupTableAddresses(h.profile),
  });
  await h.process(operation, manager);
});

export default example;

await runIfMain(import.meta.url, example);

/**
 * kamino:kvault-direct-withdraw — a user withdraws their share directly from a
 * Kamino vault (kvault) strategy. The user signs.
 *
 * Run:   pnpm exec tsx examples/src/kamino/kvault-direct-withdraw.ts   (or: pnpm example -- kamino:kvault-direct-withdraw)
 * Needs: profile vault.* + integrations.kamino.kvaultAddress; USER_KEYPAIR.
 *        Decodes the on-chain kvault — needs a working RPC even in print mode.
 * Mode:  defaults to print (--mode execute / VOLTR_MODE=execute to send).
 */
import { buildKaminoKvaultDirectWithdrawOperation } from "@voltr/scripts-kamino";
import {
  requireAssetMint,
  requireAssetTokenProgram,
  requireKaminoKvault,
  requireVaultAddress,
  resolveLookupTableAddresses,
} from "@voltr/scripts-core";
import { defineExample, runIfMain } from "../shared/harness.js";

const example = defineExample("kamino:kvault-direct-withdraw", async (h) => {
  const user = await h.signer("user");
  const operation = await buildKaminoKvaultDirectWithdrawOperation(h.ctx, {
    user,
    vault: requireVaultAddress(h.profile),
    assetMint: requireAssetMint(h.profile),
    assetTokenProgram: requireAssetTokenProgram(h.profile),
    kvault: requireKaminoKvault(h.profile),
    lookupTableAddresses: resolveLookupTableAddresses(h.profile),
  });
  await h.process(operation, user);
});

export default example;

await runIfMain(import.meta.url, example);

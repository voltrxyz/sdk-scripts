/**
 * kamino:kvault-withdraw — withdraw vault assets from a Kamino vault (kvault).
 * Pass a very large AMOUNT to withdraw the entire position.
 *
 * Run:   pnpm exec tsx examples/src/kamino/kvault-withdraw.ts   (or: pnpm example -- kamino:kvault-withdraw)
 * Needs: profile vault.* + integrations.kamino.kvaultAddress; MANAGER_KEYPAIR.
 *        Decodes the on-chain kvault — needs a working RPC even in print mode.
 * Mode:  defaults to print (--mode execute / VOLTR_MODE=execute to send).
 */
import { buildKaminoKvaultWithdrawOperation } from "@voltr/scripts-kamino";
import {
  requireAssetMint,
  requireAssetTokenProgram,
  requireKaminoKvault,
  requireVaultAddress,
  resolveLookupTableAddresses,
} from "@voltr/scripts-core";
import { defineExample, runIfMain } from "../shared/harness.js";

// --- edit for your run ---
const AMOUNT = 1_000_000n; // raw asset amount, smallest units
// -------------------------

const example = defineExample("kamino:kvault-withdraw", async (h) => {
  const manager = await h.signer("manager");
  const operation = await buildKaminoKvaultWithdrawOperation(h.ctx, {
    manager,
    vault: requireVaultAddress(h.profile),
    assetMint: requireAssetMint(h.profile),
    assetTokenProgram: requireAssetTokenProgram(h.profile),
    kvault: requireKaminoKvault(h.profile),
    amount: AMOUNT,
    lookupTableAddresses: resolveLookupTableAddresses(h.profile),
  });
  await h.process(operation, manager);
});

export default example;

await runIfMain(import.meta.url, example);

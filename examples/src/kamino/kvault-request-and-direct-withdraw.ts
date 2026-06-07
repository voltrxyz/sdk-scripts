/**
 * kamino:kvault-request-and-direct-withdraw — request a vault withdrawal and
 * direct-withdraw from the Kamino vault (kvault) strategy in one transaction.
 * The user signs.
 *
 * Run:   pnpm exec tsx examples/src/kamino/kvault-request-and-direct-withdraw.ts
 *        (or: pnpm example -- kamino:kvault-request-and-direct-withdraw)
 * Needs: profile vault.* + integrations.kamino.kvaultAddress; USER_KEYPAIR.
 *        Decodes the on-chain kvault — needs a working RPC even in print mode.
 * Mode:  defaults to print (--mode execute / VOLTR_MODE=execute to send).
 */
import { buildKaminoKvaultRequestAndDirectWithdrawOperation } from "@voltr/scripts-kamino";
import {
  requireAssetMint,
  requireAssetTokenProgram,
  requireKaminoKvault,
  requireVaultAddress,
  resolveLookupTableAddresses,
} from "@voltr/scripts-core";
import { defineExample, runIfMain } from "../shared/harness.js";

// --- edit for your run ---
const AMOUNT = 1_000_000n; // raw amount to request (LP units when IN_LP is true)
const IN_LP = false; // interpret AMOUNT as LP tokens instead of asset units
const WITHDRAW_ALL = false; // withdraw the entire position (overrides AMOUNT)
// -------------------------

const example = defineExample(
  "kamino:kvault-request-and-direct-withdraw",
  async (h) => {
    const user = await h.signer("user");
    const operation = await buildKaminoKvaultRequestAndDirectWithdrawOperation(
      h.ctx,
      {
        user,
        vault: requireVaultAddress(h.profile),
        assetMint: requireAssetMint(h.profile),
        assetTokenProgram: requireAssetTokenProgram(h.profile),
        kvault: requireKaminoKvault(h.profile),
        withdrawAmount: AMOUNT,
        isAmountInLp: IN_LP,
        isWithdrawAll: WITHDRAW_ALL,
        lookupTableAddresses: resolveLookupTableAddresses(h.profile),
      }
    );
    await h.process(operation, user);
  }
);

export default example;

await runIfMain(import.meta.url, example);

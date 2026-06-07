/**
 * trustful:arbitrary-withdraw — withdraw assets from a Trustful arbitrary
 * strategy back into the vault. Return strategy assets to the withdrawal-holding
 * account (printed by arbitrary-deposit.ts) before running this.
 *
 * Run:   pnpm exec tsx examples/src/trustful/arbitrary-withdraw.ts   (or: pnpm example -- trustful:arbitrary-withdraw)
 * Needs: profile vault.* + integrations.trustful.strategySeedString; MANAGER_KEYPAIR.
 * Mode:  defaults to print (--mode execute / VOLTR_MODE=execute to send).
 */
import { buildTrustfulArbitraryWithdrawOperation } from "@voltr/scripts-trustful";
import {
  requireAssetMint,
  requireAssetTokenProgram,
  requireTrustfulIntegration,
  requireVaultAddress,
  resolveLookupTableAddresses,
} from "@voltr/scripts-core";
import { defineExample, runIfMain } from "../shared/harness.js";

// --- edit for your run ---
const AMOUNT = 1_000_000n; // raw asset amount, smallest units
const POSITION_VALUE_AFTER = 0n; // expected strategy position value after withdraw
// -------------------------

const example = defineExample("trustful:arbitrary-withdraw", async (h) => {
  const manager = await h.signer("manager");
  const operation = await buildTrustfulArbitraryWithdrawOperation(h.ctx, {
    manager,
    vault: requireVaultAddress(h.profile),
    assetMint: requireAssetMint(h.profile),
    assetTokenProgram: requireAssetTokenProgram(h.profile),
    strategySeedString: requireTrustfulIntegration(h.profile).strategySeedString,
    amount: AMOUNT,
    positionValueAfterWithdraw: POSITION_VALUE_AFTER,
    lookupTableAddresses: resolveLookupTableAddresses(h.profile),
  });
  await h.process(operation, manager);
});

export default example;

await runIfMain(import.meta.url, example);

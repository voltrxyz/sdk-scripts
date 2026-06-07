/**
 * trustful:arbitrary-deposit — deposit vault assets into a Trustful arbitrary
 * strategy. Prints the withdrawal-holding account (operation metadata) the
 * manager must return strategy assets to before withdrawing.
 *
 * Run:   pnpm exec tsx examples/src/trustful/arbitrary-deposit.ts   (or: pnpm example -- trustful:arbitrary-deposit)
 * Needs: profile vault.* + integrations.trustful.strategySeedString; MANAGER_KEYPAIR.
 * Mode:  defaults to print (--mode execute / VOLTR_MODE=execute to send).
 */
import { buildTrustfulArbitraryDepositOperation } from "@voltr/scripts-trustful";
import {
  address,
  requireAssetMint,
  requireAssetTokenProgram,
  requireTrustfulIntegration,
  requireVaultAddress,
  resolveLookupTableAddresses,
} from "@voltr/scripts-core";
import { defineExample, runIfMain } from "../shared/harness.js";

// --- edit for your run ---
const AMOUNT = 1_000_000n; // raw asset amount, smallest units
const DESTINATION = address("So11111111111111111111111111111111111111112"); // asset token account the strategy deposits into
const POSITION_VALUE_AFTER = 1_000_000n; // expected strategy position value after deposit
// -------------------------

const example = defineExample("trustful:arbitrary-deposit", async (h) => {
  const manager = await h.signer("manager");
  const operation = await buildTrustfulArbitraryDepositOperation(h.ctx, {
    manager,
    vault: requireVaultAddress(h.profile),
    assetMint: requireAssetMint(h.profile),
    assetTokenProgram: requireAssetTokenProgram(h.profile),
    strategySeedString: requireTrustfulIntegration(h.profile).strategySeedString,
    destinationAssetTokenAccount: DESTINATION,
    amount: AMOUNT,
    positionValueAfterDeposit: POSITION_VALUE_AFTER,
    lookupTableAddresses: resolveLookupTableAddresses(h.profile),
  });
  await h.process(operation, manager);
});

export default example;

await runIfMain(import.meta.url, example);

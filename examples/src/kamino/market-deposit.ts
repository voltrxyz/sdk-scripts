/**
 * kamino:market-deposit — deposit vault assets into a Kamino lending market.
 *
 * Run:   pnpm exec tsx examples/src/kamino/market-deposit.ts   (or: pnpm example -- kamino:market-deposit)
 * Needs: profile vault.* + integrations.kamino.reserveAddress; MANAGER_KEYPAIR.
 *        Decodes the on-chain reserve — needs a working RPC even in print mode.
 * Mode:  defaults to print (--mode execute / VOLTR_MODE=execute to send).
 */
import { buildKaminoMarketDepositOperation } from "@voltr/scripts-kamino";
import {
  requireAssetMint,
  requireAssetTokenProgram,
  requireKaminoReserve,
  requireVaultAddress,
  resolveLookupTableAddresses,
} from "@voltr/scripts-core";
import { defineExample, runIfMain } from "../shared/harness.js";

// --- edit for your run ---
const AMOUNT = 1_000_000n; // raw asset amount, smallest units
// -------------------------

const example = defineExample("kamino:market-deposit", async (h) => {
  const manager = await h.signer("manager");
  const operation = await buildKaminoMarketDepositOperation(h.ctx, {
    manager,
    vault: requireVaultAddress(h.profile),
    assetMint: requireAssetMint(h.profile),
    assetTokenProgram: requireAssetTokenProgram(h.profile),
    reserve: requireKaminoReserve(h.profile),
    amount: AMOUNT,
    lookupTableAddresses: resolveLookupTableAddresses(h.profile),
  });
  await h.process(operation, manager);
});

export default example;

await runIfMain(import.meta.url, example);

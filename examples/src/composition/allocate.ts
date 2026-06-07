/**
 * composition:allocate — sequence operations from MORE THAN ONE package through
 * the shared processor.
 *
 * Builds a Kamino kvault init (@voltr/scripts-kamino) and a Jupiter Earn deposit
 * (@voltr/scripts-spot), then submits each through the SAME processor — one
 * transaction per operation, never bypassing it or hand-rolling assembly. This
 * is the pattern a custom app uses to compose builders from different packages.
 *
 * Run:   pnpm exec tsx examples/src/composition/allocate.ts   (or: pnpm example -- composition:allocate)
 * Needs: profile vault.* + integrations.kamino.kvaultAddress; MANAGER_KEYPAIR.
 * Mode:  defaults to print (--mode execute / VOLTR_MODE=execute to send).
 */
import { buildKaminoKvaultInitOperation } from "@voltr/scripts-kamino";
import { buildSpotEarnDepositOperation } from "@voltr/scripts-spot";
import {
  requireAssetMint,
  requireAssetTokenProgram,
  requireKaminoKvault,
  requireVaultAddress,
  resolveLookupTableAddresses,
  type BuiltOperation,
} from "@voltr/scripts-core";
import { defineExample, runIfMain } from "../shared/harness.js";

// --- edit for your run ---
const EARN_AMOUNT = 1_000_000n; // raw asset amount to deposit into Jupiter Earn
// -------------------------

const example = defineExample("composition:allocate", async (h) => {
  const manager = await h.signer("manager");
  const vault = requireVaultAddress(h.profile);
  const assetMint = requireAssetMint(h.profile);
  const assetTokenProgram = requireAssetTokenProgram(h.profile);
  const lookupTableAddresses = resolveLookupTableAddresses(h.profile);

  // Each builder comes from a different package and returns its own operation.
  const operations: BuiltOperation[] = [
    await buildKaminoKvaultInitOperation(h.ctx, {
      manager,
      vault,
      assetMint,
      assetTokenProgram,
      kvault: requireKaminoKvault(h.profile),
      lookupTableAddresses,
    }),
    await buildSpotEarnDepositOperation(h.ctx, {
      manager,
      vault,
      assetMint,
      assetTokenProgram,
      amount: EARN_AMOUNT,
      lookupTableAddresses,
    }),
  ];

  // Submit each through the shared processor in order.
  for (const [index, operation] of operations.entries()) {
    h.line(`\nstep ${index + 1}/${operations.length}:`);
    await h.process(operation, manager);
  }
});

export default example;

await runIfMain(import.meta.url, example);

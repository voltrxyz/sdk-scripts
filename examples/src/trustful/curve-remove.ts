/**
 * trustful:curve-remove — close the Trustful curve strategy.
 *
 * Run:   pnpm exec tsx examples/src/trustful/curve-remove.ts   (or: pnpm example -- trustful:curve-remove)
 * Needs: profile vault.vaultAddress; MANAGER_KEYPAIR.
 * Mode:  defaults to print (--mode execute / VOLTR_MODE=execute to send).
 */
import { buildTrustfulCurveRemoveOperation } from "@voltr/scripts-trustful";
import {
  requireVaultAddress,
  resolveLookupTableAddresses,
} from "@voltr/scripts-core";
import { defineExample, runIfMain } from "../shared/harness.js";

const example = defineExample("trustful:curve-remove", async (h) => {
  const manager = await h.signer("manager");
  const operation = await buildTrustfulCurveRemoveOperation(h.ctx, {
    manager,
    vault: requireVaultAddress(h.profile),
    lookupTableAddresses: resolveLookupTableAddresses(h.profile),
  });
  await h.process(operation, manager);
});

export default example;

await runIfMain(import.meta.url, example);

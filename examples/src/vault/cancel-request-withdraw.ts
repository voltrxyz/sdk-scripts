/**
 * vault:cancel-request-withdraw — cancel an outstanding withdrawal request.
 *
 * Only succeeds when the user has a request outstanding for the vault.
 *
 * Run:   pnpm exec tsx examples/src/vault/cancel-request-withdraw.ts   (or: pnpm example -- vault:cancel-request-withdraw)
 * Needs: profile vault.vaultAddress; USER_KEYPAIR.
 * Mode:  defaults to print (--mode execute / VOLTR_MODE=execute to send).
 */
import {
  buildCancelRequestWithdrawVaultOperation,
  requireVaultAddress,
  resolveLookupTableAddresses,
} from "@voltr/scripts-core";
import { defineExample, runIfMain } from "../shared/harness.js";

const example = defineExample("vault:cancel-request-withdraw", async (h) => {
  const user = await h.signer("user");
  const operation = await buildCancelRequestWithdrawVaultOperation(h.ctx, {
    user,
    vault: requireVaultAddress(h.profile),
    lookupTableAddresses: resolveLookupTableAddresses(h.profile),
  });
  await h.process(operation, user);
});

export default example;

await runIfMain(import.meta.url, example);

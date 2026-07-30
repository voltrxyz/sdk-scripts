/**
 * vault:update-adaptor-policy — update an initialized vault's adaptor policy.
 * The signer is the PROTOCOL admin: ADMIN_KEYPAIR must be the protocol admin
 * keypair, not the vault admin keypair.
 *
 * Run:   pnpm exec tsx examples/src/vault/update-adaptor-policy.ts   (or: pnpm example -- vault:update-adaptor-policy)
 * Needs: profile vault.vaultAddress; ADMIN_KEYPAIR.
 * Mode:  defaults to print (--mode execute / VOLTR_MODE=execute to send).
 */
import {
  buildUpdateVaultAdaptorPolicyOperation,
  requireVaultAddress,
} from "@voltr/scripts-core";
import { defineExample, runIfMain } from "../shared/harness.js";

// --- edit for your run ---
// 0 enforces the program allowlist; 1 lets this vault add any executable adaptor.
const ALLOW_ANY_ADAPTOR = 1;
// -------------------------

const example = defineExample("vault:update-adaptor-policy", async (h) => {
  const admin = await h.signer("admin");
  const operation = await buildUpdateVaultAdaptorPolicyOperation(h.ctx, {
    admin,
    vault: requireVaultAddress(h.profile),
    allowAnyAdaptor: ALLOW_ANY_ADAPTOR,
  });
  await h.process(operation, admin);
});

export default example;

await runIfMain(import.meta.url, example);

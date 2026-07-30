/**
 * vault:accept-admin — accept the pending-admin role for an initialized vault.
 *
 * ADMIN_KEYPAIR here is the INCOMING (pending) vault admin, previously set via
 * vault:update-config with the PendingAdmin field; the signer role is admin.
 *
 * Run:   pnpm exec tsx examples/src/vault/accept-admin.ts   (or: pnpm example -- vault:accept-admin)
 * Needs: profile vault.vaultAddress; ADMIN_KEYPAIR.
 * Mode:  defaults to print (--mode execute / VOLTR_MODE=execute to send).
 */
import {
  buildAcceptVaultAdminOperation,
  requireVaultAddress,
} from "@voltr/scripts-core";
import { defineExample, runIfMain } from "../shared/harness.js";

const example = defineExample("vault:accept-admin", async (h) => {
  const pendingAdmin = await h.signer("admin");
  const operation = await buildAcceptVaultAdminOperation(h.ctx, {
    pendingAdmin,
    vault: requireVaultAddress(h.profile),
  });
  await h.process(operation, pendingAdmin);
});

export default example;

await runIfMain(import.meta.url, example);

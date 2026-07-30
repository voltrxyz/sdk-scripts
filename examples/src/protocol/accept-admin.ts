/**
 * protocol:accept-admin — accept the pending protocol-admin role.
 *
 * ADMIN_KEYPAIR is the INCOMING protocol admin set by
 * protocol:set-pending-admin.
 *
 * Run:   pnpm exec tsx examples/src/protocol/accept-admin.ts   (or: pnpm example -- protocol:accept-admin)
 * Needs: ADMIN_KEYPAIR.
 * Mode:  defaults to print (--mode execute / VOLTR_MODE=execute to send).
 */
import { buildAcceptProtocolAdminOperation } from "@voltr/scripts-core";
import { defineExample, runIfMain } from "../shared/harness.js";

const example = defineExample("protocol:accept-admin", async (h) => {
  const pendingAdmin = await h.signer("admin");
  const operation = await buildAcceptProtocolAdminOperation(h.ctx, {
    pendingAdmin,
  });
  await h.process(operation, pendingAdmin);
});

export default example;

await runIfMain(import.meta.url, example);

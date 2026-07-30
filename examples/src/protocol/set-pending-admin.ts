/**
 * protocol:set-pending-admin — set the incoming protocol admin. This is step 1
 * of the protocol-admin transfer; the incoming admin completes it with
 * protocol:accept-admin.
 *
 * Run:   pnpm exec tsx examples/src/protocol/set-pending-admin.ts   (or: pnpm example -- protocol:set-pending-admin)
 * Needs: ADMIN_KEYPAIR.
 * Mode:  defaults to print (--mode execute / VOLTR_MODE=execute to send).
 */
import {
  address,
  buildSetPendingProtocolAdminOperation,
} from "@voltr/scripts-core";
import { defineExample, runIfMain } from "../shared/harness.js";

// --- edit for your run ---
const PENDING_ADMIN = address("So11111111111111111111111111111111111111112");
// -------------------------

const example = defineExample("protocol:set-pending-admin", async (h) => {
  const admin = await h.signer("admin");
  const operation = await buildSetPendingProtocolAdminOperation(h.ctx, {
    admin,
    pendingAdmin: PENDING_ADMIN,
  });
  await h.process(operation, admin);
});

export default example;

await runIfMain(import.meta.url, example);

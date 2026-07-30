/**
 * protocol:update-treasury — update the address that receives the protocol fee
 * share on harvest. The signer is the protocol admin.
 *
 * Run:   pnpm exec tsx examples/src/protocol/update-treasury.ts   (or: pnpm example -- protocol:update-treasury)
 * Needs: ADMIN_KEYPAIR.
 * Mode:  defaults to print (--mode execute / VOLTR_MODE=execute to send).
 */
import {
  address,
  buildUpdateProtocolTreasuryOperation,
} from "@voltr/scripts-core";
import { defineExample, runIfMain } from "../shared/harness.js";

// --- edit for your run ---
const TREASURY = address("So11111111111111111111111111111111111111112");
// -------------------------

const example = defineExample("protocol:update-treasury", async (h) => {
  const admin = await h.signer("admin");
  const operation = await buildUpdateProtocolTreasuryOperation(h.ctx, {
    admin,
    treasury: TREASURY,
  });
  await h.process(operation, admin);
});

export default example;

await runIfMain(import.meta.url, example);

/**
 * vault:remove-adaptor — deregister an adaptor program from an initialized vault.
 *
 * Run:   pnpm exec tsx examples/src/vault/remove-adaptor.ts   (or: pnpm example -- vault:remove-adaptor)
 * Needs: profile vault.vaultAddress; ADMIN_KEYPAIR.
 * Mode:  defaults to print (--mode execute / VOLTR_MODE=execute to send).
 */
import { KAMINO_ADAPTOR_PROGRAM_ID } from "@voltr/scripts-kamino";
import {
  buildRemoveAdaptorOperation,
  requireVaultAddress,
} from "@voltr/scripts-core";
import { defineExample, runIfMain } from "../shared/harness.js";

// --- edit for your run ---
// Any adapter package constant or custom adaptor program address works.
const ADAPTOR_PROGRAM = KAMINO_ADAPTOR_PROGRAM_ID;
// -------------------------

const example = defineExample("vault:remove-adaptor", async (h) => {
  const admin = await h.signer("admin");
  const operation = await buildRemoveAdaptorOperation(h.ctx, {
    admin,
    vault: requireVaultAddress(h.profile),
    adaptorProgram: ADAPTOR_PROGRAM,
  });
  await h.process(operation, admin);
});

export default example;

await runIfMain(import.meta.url, example);

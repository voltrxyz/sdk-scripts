/**
 * vault:add-adaptor — register an adaptor program on an initialized vault.
 *
 * Run:   pnpm exec tsx examples/src/vault/add-adaptor.ts   (or: pnpm example -- vault:add-adaptor)
 * Needs: profile vault.vaultAddress; ADMIN_KEYPAIR.
 * Mode:  defaults to print (--mode execute / VOLTR_MODE=execute to send).
 */
import { KAMINO_ADAPTOR_PROGRAM_ID } from "@voltr/scripts-kamino";
import {
  buildAddAdaptorOperation,
  requireVaultAddress,
} from "@voltr/scripts-core";
import { defineExample, runIfMain } from "../shared/harness.js";

// --- edit for your run ---
// Any adapter package constant or custom adaptor program address works.
const ADAPTOR_PROGRAM = KAMINO_ADAPTOR_PROGRAM_ID;
// -------------------------

const example = defineExample("vault:add-adaptor", async (h) => {
  const admin = await h.signer("admin");
  const operation = await buildAddAdaptorOperation(h.ctx, {
    admin,
    vault: requireVaultAddress(h.profile),
    adaptorProgram: ADAPTOR_PROGRAM,
  });
  await h.process(operation, admin);
});

export default example;

await runIfMain(import.meta.url, example);

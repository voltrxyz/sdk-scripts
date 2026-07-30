/**
 * vault:harvest-fee — ensure the admin, manager, and protocol-treasury LP token
 * accounts exist (reads RPC in print mode), then harvest accrued fees into them.
 * MANAGER receives the manager fee share; omitting protocolTreasury defaults to
 * PROTOCOL_TREASURY.
 *
 * Run:   pnpm exec tsx examples/src/vault/harvest-fee.ts   (or: pnpm example -- vault:harvest-fee)
 * Needs: profile vault.vaultAddress; ADMIN_KEYPAIR; RPC_URL.
 * Mode:  defaults to print (--mode execute / VOLTR_MODE=execute to send).
 */
import {
  address,
  buildHarvestFeeOperation,
  requireVaultAddress,
} from "@voltr/scripts-core";
import { defineExample, runIfMain } from "../shared/harness.js";

// --- edit for your run ---
const MANAGER = address("So11111111111111111111111111111111111111112");
// -------------------------

const example = defineExample("vault:harvest-fee", async (h) => {
  const admin = await h.signer("admin");
  const operation = await buildHarvestFeeOperation(h.ctx, {
    admin,
    manager: MANAGER,
    vault: requireVaultAddress(h.profile),
  });
  await h.process(operation, admin);
});

export default example;

await runIfMain(import.meta.url, example);

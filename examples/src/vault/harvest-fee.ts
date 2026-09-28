/**
 * vault:harvest-fee — idempotently ensure the vault admin, manager, and
 * protocol-treasury LP token accounts exist, then harvest accrued fees into
 * them. Harvest is permissionless: the signer is the harvester and only pays
 * the transaction fee plus rent for missing LP accounts. The vaultAdmin and
 * MANAGER passed here must equal the admin and manager stored on the vault;
 * omitting protocolTreasury defaults to PROTOCOL_TREASURY. To harvest every
 * protocol-fee vault with the recipients read live from chain, see
 * protocol/harvest-fee.ts.
 *
 * Run:   pnpm exec tsx examples/src/vault/harvest-fee.ts   (or: pnpm example -- vault:harvest-fee)
 * Needs: profile vault.vaultAddress; ADMIN_KEYPAIR.
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
    harvester: admin,
    // The signer is assumed to be the vault admin; pass the vault's admin
    // address here when harvesting on someone else's behalf.
    vaultAdmin: admin.address,
    manager: MANAGER,
    vault: requireVaultAddress(h.profile),
  });
  await h.process(operation, admin);
});

export default example;

await runIfMain(import.meta.url, example);

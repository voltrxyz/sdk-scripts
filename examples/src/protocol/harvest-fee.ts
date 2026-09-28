/**
 * protocol:harvest-fee — harvest accrued fees on every vault that has a
 * protocol fee configured, one operation per vault. The vault admin, manager,
 * and protocol treasury are read live from chain. Harvest is permissionless:
 * ADMIN_KEYPAIR only needs to be a funded keypair (it pays transaction fees and
 * rent for missing LP accounts). Each harvest also mints the admin and manager
 * fee shares — that is how the instruction works.
 *
 * Run:   pnpm exec tsx examples/src/protocol/harvest-fee.ts   (or: pnpm example -- protocol:harvest-fee)
 * Needs: RPC_URL; ADMIN_KEYPAIR (any funded keypair).
 * Mode:  defaults to print (--mode execute / VOLTR_MODE=execute to send).
 */
import {
  buildHarvestFeeOperation,
  queryProtocolFeeVaults,
} from "@voltr/scripts-core";
import { defineExample, runIfMain } from "../shared/harness.js";

const example = defineExample("protocol:harvest-fee", async (h) => {
  const harvester = await h.signer("admin");
  const snapshot = await queryProtocolFeeVaults(h.ctx);
  if (!snapshot.protocol.harvestEnabled) {
    throw new Error(
      "Harvesting is disabled at the protocol level; nothing was sent."
    );
  }
  h.field("protocol treasury", snapshot.protocol.treasury);
  h.field(
    "vaults with a protocol fee",
    `${snapshot.vaults.length} of ${snapshot.totalVaults}`
  );

  for (const vault of snapshot.vaults) {
    if (vault.harvestDisabled) {
      h.note(
        `skipping ${vault.name} (${vault.vault}): harvest-fee is disabled on this vault`
      );
      continue;
    }
    h.heading(`${vault.name} (${vault.vault})`);
    h.field("accrued protocol LP", vault.accruedLpProtocolFees);
    const operation = await buildHarvestFeeOperation(h.ctx, {
      harvester,
      vaultAdmin: vault.admin,
      manager: vault.manager,
      protocolTreasury: snapshot.protocol.treasury,
      vault: vault.vault,
    });
    await h.process(operation, harvester);
  }
});

export default example;

await runIfMain(import.meta.url, example);

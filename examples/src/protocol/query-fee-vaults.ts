/**
 * protocol:query-fee-vaults — list every vault with a protocol fee configured
 * (read-only): admin, manager, fee configuration, accrued (unharvested) LP
 * fees, and the live protocol config (treasury, harvest flag).
 *
 * Read-only: no keypair, mode is ignored, but a working RPC is required. The
 * harness still loads a profile; none of its fields are used here.
 *
 * Run:   pnpm exec tsx examples/src/protocol/query-fee-vaults.ts   (or: pnpm example -- protocol:query-fee-vaults)
 * Needs: RPC_URL.
 */
import { queryProtocolFeeVaults } from "@voltr/scripts-core";
import { defineExample, runIfMain } from "../shared/harness.js";

const example = defineExample("protocol:query-fee-vaults", async (h) => {
  const snapshot = await queryProtocolFeeVaults(h.ctx);
  h.json(snapshot);
});

export default example;

await runIfMain(import.meta.url, example);

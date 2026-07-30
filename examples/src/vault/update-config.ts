/**
 * vault:update-config — update one configuration field on an initialized vault.
 * Management-fee updates auto-append the LP mint account.
 *
 * Run:   pnpm exec tsx examples/src/vault/update-config.ts   (or: pnpm example -- vault:update-config)
 * Needs: profile vault.vaultAddress; ADMIN_KEYPAIR.
 * Mode:  defaults to print (--mode execute / VOLTR_MODE=execute to send).
 */
import {
  buildUpdateVaultConfigOperation,
  requireVaultAddress,
  VaultConfigField,
  type Address,
} from "@voltr/scripts-core";
import { defineExample, runIfMain } from "../shared/harness.js";

// --- edit for your run ---
const FIELD = VaultConfigField.MaxCap;
const VALUE: bigint | number | Address = 2_000_000_000_000n;
// u64 fields (MaxCap, StartAtTs, LockedProfitDegradationDuration,
// WithdrawalWaitingPeriod) take bigint; u16 fee/bitmask fields take number;
// address fields (Manager, PendingAdmin) take an Address. See vaultConfigFieldKind in core.
// -------------------------

const example = defineExample("vault:update-config", async (h) => {
  const admin = await h.signer("admin");
  const operation = await buildUpdateVaultConfigOperation(h.ctx, {
    admin,
    vault: requireVaultAddress(h.profile),
    field: FIELD,
    value: VALUE,
  });
  await h.process(operation, admin);
});

export default example;

await runIfMain(import.meta.url, example);

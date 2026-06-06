import { test } from "node:test";
import assert from "node:assert/strict";
import { address, getAddressEncoder } from "@solana/kit";
import {
  parseVaultConfigField,
  serializeVaultConfigValue,
  VAULT_CONFIG_FIELD_NAMES,
  vaultConfigFieldKind,
  VaultConfigField,
} from "./config.js";

test("serializeVaultConfigValue encodes u64 fields little-endian", () => {
  const bytes = serializeVaultConfigValue(VaultConfigField.MaxCap, 1n);
  assert.equal(bytes.length, 8);
  assert.deepEqual([...bytes], [1, 0, 0, 0, 0, 0, 0, 0]);

  // StartAtTs, LockedProfitDegradationDuration, WithdrawalWaitingPeriod share
  // the same u64 layout.
  assert.equal(
    serializeVaultConfigValue(VaultConfigField.WithdrawalWaitingPeriod, 256n)
      .length,
    8
  );
  assert.deepEqual(
    [...serializeVaultConfigValue(VaultConfigField.StartAtTs, 256n)],
    [0, 1, 0, 0, 0, 0, 0, 0]
  );
});

test("serializeVaultConfigValue encodes u16 fee fields little-endian", () => {
  const bytes = serializeVaultConfigValue(
    VaultConfigField.ManagerPerformanceFee,
    500
  );
  assert.equal(bytes.length, 2);
  // 500 = 0x01F4 -> little-endian [0xF4, 0x01].
  assert.deepEqual([...bytes], [0xf4, 0x01]);

  assert.equal(
    serializeVaultConfigValue(VaultConfigField.DisabledOperations, 0).length,
    2
  );
});

test("serializeVaultConfigValue encodes address fields as 32 bytes", () => {
  const manager = address("vxyzZyfd6nJ3v82fTSmuRiKF4owWF9sAXqneu9mne9n");
  const bytes = serializeVaultConfigValue(VaultConfigField.Manager, manager);
  assert.equal(bytes.length, 32);
  assert.deepEqual([...bytes], [...getAddressEncoder().encode(manager)]);
});

test("vaultConfigFieldKind classifies every field's encoding", () => {
  assert.equal(vaultConfigFieldKind(VaultConfigField.MaxCap), "u64");
  assert.equal(
    vaultConfigFieldKind(VaultConfigField.WithdrawalWaitingPeriod),
    "u64"
  );
  assert.equal(
    vaultConfigFieldKind(VaultConfigField.ManagerPerformanceFee),
    "u16"
  );
  assert.equal(
    vaultConfigFieldKind(VaultConfigField.DisabledOperations),
    "u16"
  );
  assert.equal(vaultConfigFieldKind(VaultConfigField.Manager), "address");
  assert.equal(vaultConfigFieldKind(VaultConfigField.PendingAdmin), "address");
});

test("parseVaultConfigField maps kebab-case names to the enum", () => {
  assert.equal(parseVaultConfigField("max-cap"), VaultConfigField.MaxCap);
  assert.equal(
    parseVaultConfigField("pending-admin"),
    VaultConfigField.PendingAdmin
  );
  // MaxCap is 0; a naive truthiness check would misreport it as unknown.
  assert.equal(VAULT_CONFIG_FIELD_NAMES.includes("max-cap"), true);
});

test("parseVaultConfigField rejects an unknown field, listing valid names", () => {
  assert.throws(
    () => parseVaultConfigField("bogus-field"),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /Unknown vault config field "bogus-field"/);
      assert.match(error.message, /max-cap/);
      return true;
    }
  );
});

test("serializeVaultConfigValue rejects mismatched value types", () => {
  assert.throws(
    () => serializeVaultConfigValue(VaultConfigField.MaxCap, 5 as never),
    /Expected bigint/
  );
  assert.throws(
    () =>
      serializeVaultConfigValue(
        VaultConfigField.ManagerPerformanceFee,
        5n as never
      ),
    /Expected number/
  );
  assert.throws(
    () => serializeVaultConfigValue(VaultConfigField.Manager, 5 as never),
    /Expected Address/
  );
});

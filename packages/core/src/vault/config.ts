import {
  getAddressEncoder,
  getU16Encoder,
  getU64Encoder,
  type Address,
} from "@solana/kit";
import { VaultConfigField } from "@voltr/vault-sdk";

export { VaultConfigField };

/**
 * One-time configuration applied when a vault is initialized. Field names and
 * units mirror the Voltr `initializeVault` instruction args (fees in basis
 * points, durations/timestamps in seconds, caps in raw asset base units).
 */
export interface VaultInitConfig {
  maxCap: bigint;
  startAtTs: bigint;
  managerPerformanceFee: number;
  adminPerformanceFee: number;
  managerManagementFee: number;
  adminManagementFee: number;
  lockedProfitDegradationDuration: bigint;
  redemptionFee: number;
  issuanceFee: number;
  withdrawalWaitingPeriod: bigint;
}

/** Metaplex LP token metadata set on (or after) vault initialization. */
export interface LpTokenMetadata {
  name: string;
  symbol: string;
  uri: string;
}

/**
 * The on-chain value encoding a config field uses:
 *
 *   - `u64`: caps, timestamps, and durations (8-byte LE integer);
 *   - `u16`: fee values and the disabled-operations bitmask (2-byte LE integer);
 *   - `address`: the manager / pending-admin fields (32-byte pubkey).
 */
export type VaultConfigFieldKind = "u64" | "u16" | "address";

/**
 * Maps a {@link VaultConfigField} to the value encoding it expects. This is the
 * single source of truth shared by {@link serializeVaultConfigValue} (which
 * encodes) and the CLI (which coerces a `--value` flag to the right type).
 */
export function vaultConfigFieldKind(
  field: VaultConfigField
): VaultConfigFieldKind {
  switch (field) {
    case VaultConfigField.MaxCap:
    case VaultConfigField.StartAtTs:
    case VaultConfigField.LockedProfitDegradationDuration:
    case VaultConfigField.WithdrawalWaitingPeriod:
      return "u64";

    case VaultConfigField.ManagerPerformanceFee:
    case VaultConfigField.AdminPerformanceFee:
    case VaultConfigField.ManagerManagementFee:
    case VaultConfigField.AdminManagementFee:
    case VaultConfigField.RedemptionFee:
    case VaultConfigField.IssuanceFee:
    case VaultConfigField.DisabledOperations:
      return "u16";

    case VaultConfigField.Manager:
    case VaultConfigField.PendingAdmin:
      return "address";

    default:
      throw new Error(`Unknown vault config field: ${field}`);
  }
}

/**
 * Serializes a vault-config update value into the little-endian byte layout the
 * `updateVaultConfig` instruction expects for the given field (see
 * {@link vaultConfigFieldKind} for the per-field encoding).
 *
 * Throws if the runtime type of `value` does not match the field.
 */
export function serializeVaultConfigValue(
  field: VaultConfigField,
  value: bigint | number | Address
): Uint8Array {
  switch (vaultConfigFieldKind(field)) {
    case "u64": {
      if (typeof value !== "bigint") {
        throw new Error(
          `Expected bigint for field ${field}, got ${typeof value}`
        );
      }
      return new Uint8Array(getU64Encoder().encode(value));
    }

    case "u16": {
      if (typeof value !== "number") {
        throw new Error(
          `Expected number for field ${field}, got ${typeof value}`
        );
      }
      return new Uint8Array(getU16Encoder().encode(value));
    }

    case "address": {
      if (typeof value !== "string") {
        throw new Error(
          `Expected Address for field ${field}, got ${typeof value}`
        );
      }
      return new Uint8Array(getAddressEncoder().encode(value as Address));
    }
  }
}

/**
 * CLI-friendly kebab-case names for each {@link VaultConfigField}, used by the
 * `vault:update-config --field <name>` flag. Kept in enum order so the help
 * text lists them predictably.
 */
const VAULT_CONFIG_FIELD_BY_NAME: Record<string, VaultConfigField> = {
  "max-cap": VaultConfigField.MaxCap,
  "start-at-ts": VaultConfigField.StartAtTs,
  "locked-profit-degradation-duration":
    VaultConfigField.LockedProfitDegradationDuration,
  "withdrawal-waiting-period": VaultConfigField.WithdrawalWaitingPeriod,
  "manager-performance-fee": VaultConfigField.ManagerPerformanceFee,
  "admin-performance-fee": VaultConfigField.AdminPerformanceFee,
  "manager-management-fee": VaultConfigField.ManagerManagementFee,
  "admin-management-fee": VaultConfigField.AdminManagementFee,
  "redemption-fee": VaultConfigField.RedemptionFee,
  "issuance-fee": VaultConfigField.IssuanceFee,
  manager: VaultConfigField.Manager,
  "pending-admin": VaultConfigField.PendingAdmin,
  "disabled-operations": VaultConfigField.DisabledOperations,
};

/** The kebab-case field names accepted by {@link parseVaultConfigField}. */
export const VAULT_CONFIG_FIELD_NAMES = Object.keys(VAULT_CONFIG_FIELD_BY_NAME);

/**
 * Resolves a kebab-case field name (e.g. `"max-cap"`, `"pending-admin"`) to its
 * {@link VaultConfigField}. Throws an error naming the valid fields when the
 * name is unknown.
 */
export function parseVaultConfigField(name: string): VaultConfigField {
  const field = VAULT_CONFIG_FIELD_BY_NAME[name];
  // VaultConfigField.MaxCap is 0 (falsy), so test for `undefined` explicitly.
  if (field === undefined) {
    throw new Error(
      `Unknown vault config field "${name}". Valid fields: ${VAULT_CONFIG_FIELD_NAMES.join(
        ", "
      )}`
    );
  }
  return field;
}

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
 * Serializes a vault-config update value into the little-endian byte layout the
 * `updateVaultConfig` instruction expects for the given field. The encoding is
 * field-dependent:
 *
 *   - u64 LE for caps, timestamps, and durations;
 *   - u16 LE for fee values and the disabled-operations bitmask;
 *   - a 32-byte address for the manager / pending-admin fields.
 *
 * Throws if the runtime type of `value` does not match the field.
 */
export function serializeVaultConfigValue(
  field: VaultConfigField,
  value: bigint | number | Address
): Uint8Array {
  switch (field) {
    case VaultConfigField.MaxCap:
    case VaultConfigField.StartAtTs:
    case VaultConfigField.LockedProfitDegradationDuration:
    case VaultConfigField.WithdrawalWaitingPeriod: {
      if (typeof value !== "bigint") {
        throw new Error(
          `Expected bigint for field ${field}, got ${typeof value}`
        );
      }
      return new Uint8Array(getU64Encoder().encode(value));
    }

    case VaultConfigField.ManagerPerformanceFee:
    case VaultConfigField.AdminPerformanceFee:
    case VaultConfigField.ManagerManagementFee:
    case VaultConfigField.AdminManagementFee:
    case VaultConfigField.RedemptionFee:
    case VaultConfigField.IssuanceFee:
    case VaultConfigField.DisabledOperations: {
      if (typeof value !== "number") {
        throw new Error(
          `Expected number for field ${field}, got ${typeof value}`
        );
      }
      return new Uint8Array(getU16Encoder().encode(value));
    }

    case VaultConfigField.Manager:
    case VaultConfigField.PendingAdmin: {
      if (typeof value !== "string") {
        throw new Error(
          `Expected Address for field ${field}, got ${typeof value}`
        );
      }
      return new Uint8Array(getAddressEncoder().encode(value as Address));
    }

    default:
      throw new Error(`Unknown vault config field: ${field}`);
  }
}

import {
  getAddressEncoder,
  type Address,
  type TransactionSigner,
} from "@solana/kit";
import {
  getAcceptProtocolAdminInstructionAsync,
  getUpdateProtocolInstructionAsync,
  getUpdateVaultAdaptorPolicyInstructionAsync,
  ProtocolConfigField,
} from "@voltr/vault-sdk";
import type { BuiltOperation, ScriptContext } from "../types.js";

export { ProtocolConfigField };

export type AllowAnyAdaptorFlag = 0 | 1;

function serializeProtocolAddress(value: Address): Uint8Array {
  return new Uint8Array(getAddressEncoder().encode(value));
}

function assertAllowAnyAdaptorFlag(
  value: number
): asserts value is AllowAnyAdaptorFlag {
  if (value !== 0 && value !== 1) {
    throw new Error(`allowAnyAdaptor must be 0 or 1: ${value}`);
  }
}

export interface UpdateProtocolTreasuryArgs {
  /** Current protocol admin; signs the protocol config update. */
  admin: TransactionSigner;
  /** New protocol treasury address that receives the protocol fee share. */
  treasury: Address;
  lookupTableAddresses?: Address[];
}

/** Builds the protocol treasury update operation. */
export async function buildUpdateProtocolTreasuryOperation(
  _ctx: ScriptContext,
  args: UpdateProtocolTreasuryArgs
): Promise<BuiltOperation> {
  const updateProtocolIx = await getUpdateProtocolInstructionAsync({
    admin: args.admin,
    field: ProtocolConfigField.Treasury,
    data: serializeProtocolAddress(args.treasury),
  });

  return {
    label: "protocol:update-treasury",
    instructions: [updateProtocolIx],
    lookupTableAddresses: args.lookupTableAddresses,
  };
}

export interface SetPendingProtocolAdminArgs {
  /** Current protocol admin; signs the pending-admin update. */
  admin: TransactionSigner;
  /** Incoming protocol admin address. */
  pendingAdmin: Address;
  lookupTableAddresses?: Address[];
}

/** Builds the first step of a protocol admin transfer. */
export async function buildSetPendingProtocolAdminOperation(
  _ctx: ScriptContext,
  args: SetPendingProtocolAdminArgs
): Promise<BuiltOperation> {
  const updateProtocolIx = await getUpdateProtocolInstructionAsync({
    admin: args.admin,
    field: ProtocolConfigField.PendingAdmin,
    data: serializeProtocolAddress(args.pendingAdmin),
  });

  return {
    label: "protocol:set-pending-admin",
    instructions: [updateProtocolIx],
    lookupTableAddresses: args.lookupTableAddresses,
  };
}

export interface AcceptProtocolAdminArgs {
  /** Pending protocol admin; signs to claim the role. */
  pendingAdmin: TransactionSigner;
  lookupTableAddresses?: Address[];
}

/** Builds the second step of a protocol admin transfer. */
export async function buildAcceptProtocolAdminOperation(
  _ctx: ScriptContext,
  args: AcceptProtocolAdminArgs
): Promise<BuiltOperation> {
  const acceptProtocolAdminIx = await getAcceptProtocolAdminInstructionAsync({
    pendingAdmin: args.pendingAdmin,
  });

  return {
    label: "protocol:accept-admin",
    instructions: [acceptProtocolAdminIx],
    lookupTableAddresses: args.lookupTableAddresses,
  };
}

export interface UpdateVaultAdaptorPolicyArgs {
  /** Current protocol admin; signs the vault adaptor-policy update. */
  admin: TransactionSigner;
  vault: Address;
  /** 0 enforces the program allowlist; 1 lets this vault add any executable adaptor. */
  allowAnyAdaptor: number;
  lookupTableAddresses?: Address[];
}

/** Builds the protocol-admin operation that toggles a vault's adaptor policy. */
export async function buildUpdateVaultAdaptorPolicyOperation(
  _ctx: ScriptContext,
  args: UpdateVaultAdaptorPolicyArgs
): Promise<BuiltOperation> {
  assertAllowAnyAdaptorFlag(args.allowAnyAdaptor);
  const updateVaultAdaptorPolicyIx =
    await getUpdateVaultAdaptorPolicyInstructionAsync({
      admin: args.admin,
      vault: args.vault,
      allowAnyAdaptor: args.allowAnyAdaptor,
    });

  return {
    label: "vault:update-adaptor-policy",
    instructions: [updateVaultAdaptorPolicyIx],
    lookupTableAddresses: args.lookupTableAddresses,
  };
}

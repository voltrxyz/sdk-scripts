import {
  AccountRole,
  type AccountMeta,
  type Address,
  type Instruction,
  type KeyPairSigner,
} from "@solana/kit";
import { findAssociatedTokenPda } from "@solana-program/token";
import {
  findLpMetadataPda,
  findVaultAssetIdleAuthPda,
  findVaultLpMintPda,
  getAcceptVaultAdminInstruction,
  getCreateLpMetadataInstructionAsync,
  getHarvestFeeInstructionAsync,
  getInitializeVaultInstructionAsync,
  getUpdateVaultConfigInstructionAsync,
} from "@voltr/vault-sdk";
import type { BuiltOperation, ScriptContext } from "../types.js";
import { setupTokenAccount } from "../token/accounts.js";
import { PROTOCOL_ADMIN } from "./constants.js";
import {
  serializeVaultConfigValue,
  VaultConfigField,
  type LpTokenMetadata,
  type VaultInitConfig,
} from "./config.js";

export interface InitVaultArgs {
  /** Pays for the vault account, becomes its admin, and signs LP metadata. */
  admin: KeyPairSigner;
  /** Vault manager (controls strategy allocation). */
  manager: Address;
  /**
   * Freshly generated keypair that becomes the vault account. The caller
   * generates it (e.g. `generateKeyPairSigner()`) so it can record/print the
   * resulting vault address; the builder never touches the filesystem.
   */
  vault: KeyPairSigner;
  assetMint: Address;
  assetTokenProgram: Address;
  config: VaultInitConfig;
  name: string;
  description: string;
  lookupTableAddresses?: Address[];
}

export interface InitVaultWithMetadataArgs extends InitVaultArgs {
  lpTokenMetadata: LpTokenMetadata;
}

async function buildInitializeVaultInstruction(
  args: InitVaultArgs
): Promise<Instruction> {
  const [vaultAssetIdleAuth] = await findVaultAssetIdleAuthPda({
    vault: args.vault.address,
  });
  const [vaultAssetIdleAta] = await findAssociatedTokenPda({
    owner: vaultAssetIdleAuth,
    mint: args.assetMint,
    tokenProgram: args.assetTokenProgram,
  });

  return getInitializeVaultInstructionAsync({
    payer: args.admin,
    admin: args.admin.address,
    manager: args.manager,
    vault: args.vault,
    vaultAssetMint: args.assetMint,
    vaultAssetIdleAta,
    assetTokenProgram: args.assetTokenProgram,
    maxCap: args.config.maxCap,
    startAtTs: args.config.startAtTs,
    managerPerformanceFee: args.config.managerPerformanceFee,
    adminPerformanceFee: args.config.adminPerformanceFee,
    managerManagementFee: args.config.managerManagementFee,
    adminManagementFee: args.config.adminManagementFee,
    lockedProfitDegradationDuration: args.config.lockedProfitDegradationDuration,
    redemptionFee: args.config.redemptionFee,
    issuanceFee: args.config.issuanceFee,
    withdrawalWaitingPeriod: args.config.withdrawalWaitingPeriod,
    name: args.name,
    description: args.description,
  });
}

async function buildCreateLpMetadataInstruction(args: {
  admin: KeyPairSigner;
  vault: Address;
  lpTokenMetadata: LpTokenMetadata;
}): Promise<Instruction> {
  const [metadataAccount] = await findLpMetadataPda({ vault: args.vault });
  return getCreateLpMetadataInstructionAsync({
    payer: args.admin,
    admin: args.admin,
    vault: args.vault,
    metadataAccount,
    name: args.lpTokenMetadata.name,
    symbol: args.lpTokenMetadata.symbol,
    uri: args.lpTokenMetadata.uri,
  });
}

/**
 * Builds the vault-initialization transaction.
 *
 * This returns only the initialization transaction. Optionally creating and
 * extending a lookup table afterwards is multi-transaction orchestration, which
 * the operation-builder contract defers to the CLI/processor layer (see
 * docs/architecture.md rule 8). The building blocks live in core
 * (`buildExtendLookupTableInstructions`, `collectInstructionAddresses`,
 * `getAddressesByLookupTable`).
 */
export async function buildInitVaultOperation(
  _ctx: ScriptContext,
  args: InitVaultArgs
): Promise<BuiltOperation> {
  const initializeVaultIx = await buildInitializeVaultInstruction(args);
  return {
    label: "vault:init",
    instructions: [initializeVaultIx],
    lookupTableAddresses: args.lookupTableAddresses,
  };
}

/**
 * Builds the vault-initialization transaction together with the LP token
 * metadata instruction (the `admin-init-vault-and-set-token-metadata` flow).
 *
 * See {@link buildInitVaultOperation} for the note on deferred LUT bootstrap.
 */
export async function buildInitVaultWithMetadataOperation(
  _ctx: ScriptContext,
  args: InitVaultWithMetadataArgs
): Promise<BuiltOperation> {
  const initializeVaultIx = await buildInitializeVaultInstruction(args);
  const createLpMetadataIx = await buildCreateLpMetadataInstruction({
    admin: args.admin,
    vault: args.vault.address,
    lpTokenMetadata: args.lpTokenMetadata,
  });
  return {
    label: "vault:init-and-set-token-metadata",
    instructions: [initializeVaultIx, createLpMetadataIx],
    lookupTableAddresses: args.lookupTableAddresses,
  };
}

export interface SetTokenMetadataArgs {
  admin: KeyPairSigner;
  vault: Address;
  lpTokenMetadata: LpTokenMetadata;
  lookupTableAddresses?: Address[];
}

/** Builds the create-LP-metadata operation for an already-initialized vault. */
export async function buildSetTokenMetadataOperation(
  _ctx: ScriptContext,
  args: SetTokenMetadataArgs
): Promise<BuiltOperation> {
  const createLpMetadataIx = await buildCreateLpMetadataInstruction({
    admin: args.admin,
    vault: args.vault,
    lpTokenMetadata: args.lpTokenMetadata,
  });
  return {
    label: "vault:set-token-metadata",
    instructions: [createLpMetadataIx],
    lookupTableAddresses: args.lookupTableAddresses,
  };
}

export interface UpdateVaultConfigArgs {
  admin: KeyPairSigner;
  vault: Address;
  field: VaultConfigField;
  /** Value whose runtime type must match the field (see serializeVaultConfigValue). */
  value: bigint | number | Address;
  lookupTableAddresses?: Address[];
}

/**
 * Builds an update-vault-config operation. Management-fee updates additionally
 * require the vault LP mint as a read-only account, which is appended here.
 */
export async function buildUpdateVaultConfigOperation(
  _ctx: ScriptContext,
  args: UpdateVaultConfigArgs
): Promise<BuiltOperation> {
  const data = serializeVaultConfigValue(args.field, args.value);

  const updateVaultConfigIx = await getUpdateVaultConfigInstructionAsync({
    admin: args.admin,
    vault: args.vault,
    field: args.field,
    data,
  });

  const requiresLpMint =
    args.field === VaultConfigField.ManagerManagementFee ||
    args.field === VaultConfigField.AdminManagementFee;

  let finalIx: Instruction = updateVaultConfigIx;
  if (requiresLpMint) {
    const [vaultLpMint] = await findVaultLpMintPda({ vault: args.vault });
    const extraAccount: AccountMeta = {
      address: vaultLpMint,
      role: AccountRole.READONLY,
    };
    finalIx = {
      ...updateVaultConfigIx,
      accounts: [...(updateVaultConfigIx.accounts ?? []), extraAccount],
    };
  }

  return {
    label: "vault:update-config",
    instructions: [finalIx],
    lookupTableAddresses: args.lookupTableAddresses,
  };
}

export interface AcceptVaultAdminArgs {
  pendingAdmin: KeyPairSigner;
  vault: Address;
  lookupTableAddresses?: Address[];
}

/** Builds the accept-vault-admin operation (pending admin claims the role). */
export async function buildAcceptVaultAdminOperation(
  _ctx: ScriptContext,
  args: AcceptVaultAdminArgs
): Promise<BuiltOperation> {
  const acceptVaultAdminIx = getAcceptVaultAdminInstruction({
    pendingAdmin: args.pendingAdmin,
    vault: args.vault,
  });
  return {
    label: "vault:accept-admin",
    instructions: [acceptVaultAdminIx],
    lookupTableAddresses: args.lookupTableAddresses,
  };
}

export interface HarvestFeeArgs {
  /** Harvester + vault admin + fee payer; the admin signs and pays. */
  admin: KeyPairSigner;
  /** Vault manager address (receives the manager fee share). */
  manager: Address;
  vault: Address;
  lookupTableAddresses?: Address[];
}

/**
 * Builds a harvest-fee operation. Ensures the LP token accounts for the vault
 * admin, vault manager, and protocol admin exist, then harvests fees into them.
 */
export async function buildHarvestFeeOperation(
  ctx: ScriptContext,
  args: HarvestFeeArgs
): Promise<BuiltOperation> {
  const instructions: Instruction[] = [];
  const [lpMint] = await findVaultLpMintPda({ vault: args.vault });

  await setupTokenAccount({
    rpc: ctx.rpc,
    payer: args.admin,
    mint: lpMint,
    owner: args.admin.address,
    instructions,
  });
  await setupTokenAccount({
    rpc: ctx.rpc,
    payer: args.admin,
    mint: lpMint,
    owner: args.manager,
    instructions,
  });
  await setupTokenAccount({
    rpc: ctx.rpc,
    payer: args.admin,
    mint: lpMint,
    owner: PROTOCOL_ADMIN,
    instructions,
  });

  instructions.push(
    await getHarvestFeeInstructionAsync({
      harvester: args.admin,
      vaultManager: args.manager,
      vaultAdmin: args.admin.address,
      protocolAdmin: PROTOCOL_ADMIN,
      vault: args.vault,
    })
  );

  return {
    label: "vault:harvest-fee",
    instructions,
    lookupTableAddresses: args.lookupTableAddresses,
  };
}

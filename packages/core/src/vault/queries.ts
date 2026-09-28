import {
  fetchMaybeToken,
  fetchMint,
  findAssociatedTokenPda,
  TOKEN_PROGRAM_ADDRESS,
} from "@solana-program/token";
import {
  calculateAssetsForWithdraw,
  fetchProtocol,
  fetchVault,
  findProtocolPda,
  findVaultLpMintPda,
  getVaultDecoder,
  getPositionAndTotalValuesForVault,
  VAULT_DISCRIMINATOR,
  VOLTR_VAULT_PROGRAM_ADDRESS,
  type Vault,
} from "@voltr/vault-sdk";
import {
  decodeAccount,
  getBase64Decoder,
  getBase64Encoder,
  lamports as toLamports,
  type Account,
  type Address,
  type Base64EncodedBytes,
  type EncodedAccount,
  type ReadonlyUint8Array,
} from "@solana/kit";
import type { ScriptContext } from "../types.js";

const DISCRIMINATOR_OFFSET = 0n;
const HARVEST_FEE_OPERATIONAL_STATE = 1 << 8;
const HARVEST_FEE_DISABLED_OPERATION = 1 << 3;

const base64Decoder = getBase64Decoder();
const base64Encoder = getBase64Encoder();

function bytesToBase64(bytes: Uint8Array): string {
  return base64Decoder.decode(bytes);
}

function base64ToBytes(base64: string): Uint8Array {
  return base64Encoder.encode(base64) as Uint8Array;
}

async function fetchAllVaultAccounts(
  ctx: ScriptContext
): Promise<Array<Account<Vault>>> {
  const results = await ctx.rpc
    .getProgramAccounts(VOLTR_VAULT_PROGRAM_ADDRESS, {
      encoding: "base64",
      filters: [
        {
          memcmp: {
            offset: DISCRIMINATOR_OFFSET,
            bytes: bytesToBase64(VAULT_DISCRIMINATOR) as Base64EncodedBytes,
            encoding: "base64",
          },
        },
      ],
    })
    .send();

  return results.map(({ pubkey, account }) => {
    const [data] = account.data;
    const encoded: EncodedAccount = {
      address: pubkey,
      data: base64ToBytes(data),
      executable: account.executable,
      lamports: toLamports(BigInt(account.lamports)),
      programAddress: account.owner,
      space: BigInt(account.space),
    };
    return decodeAccount(encoded, getVaultDecoder());
  });
}

function decodeVaultName(name: ReadonlyUint8Array): string {
  return new TextDecoder().decode(name).replace(/\0+$/u, "");
}

function compareStrings(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

export interface QueryVaultPositionArgs {
  user: Address;
  vault: Address;
}

export interface VaultPositionSnapshot {
  vault: Address;
  user: Address;
  /** User LP token balance, in LP base units (9 decimals). */
  userLpAmount: string;
  /** Total LP supply, in LP base units. */
  totalLpSupply: string;
  /** Vault total asset value, in asset base units. */
  vaultAssetTotalValue: string;
  /**
   * Approximate user share of vault assets *before* redemption fee and locked-
   * profit degradation. Floating point — for display only.
   */
  userAssetAmountBeforeFees: number;
  /**
   * Withdrawable asset amount *after* redemption fee and degradation, in asset
   * base units. This is the authoritative figure (computed on-chain-style).
   */
  userAssetAmountAfterFees: string;
}

/**
 * Reads a user's position in a vault: their LP balance, the vault's total LP
 * supply and asset value, and their withdrawable asset amount before/after
 * fees. Returns JSON-serializable data; a user with no LP account reads as 0.
 */
export async function queryVaultPosition(
  ctx: ScriptContext,
  args: QueryVaultPositionArgs
): Promise<VaultPositionSnapshot> {
  const [vaultLpMint] = await findVaultLpMintPda({ vault: args.vault });
  const [userLpAta] = await findAssociatedTokenPda({
    owner: args.user,
    mint: vaultLpMint,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  });

  const userLpAccount = await fetchMaybeToken(ctx.rpc, userLpAta);
  const userLpAmount = userLpAccount.exists ? userLpAccount.data.amount : 0n;

  const vaultLpMintAccount = await fetchMint(ctx.rpc, vaultLpMint);
  const totalLpSupply = vaultLpMintAccount.data.supply;

  const vaultAccount = await fetchVault(ctx.rpc, args.vault);
  const vaultAssetTotalValue = vaultAccount.data.asset.totalValue;

  const userLpShareRatio =
    totalLpSupply === 0n ? 0 : Number(userLpAmount) / Number(totalLpSupply);
  const userAssetAmountBeforeFees =
    Number(vaultAssetTotalValue) * userLpShareRatio;

  const userAssetAmountAfterFees = await calculateAssetsForWithdraw(
    ctx.rpc,
    args.vault,
    userLpAmount
  );

  return {
    vault: args.vault,
    user: args.user,
    userLpAmount: userLpAmount.toString(),
    totalLpSupply: totalLpSupply.toString(),
    vaultAssetTotalValue: vaultAssetTotalValue.toString(),
    userAssetAmountBeforeFees,
    userAssetAmountAfterFees: userAssetAmountAfterFees.toString(),
  };
}

export interface QueryStrategyPositionsArgs {
  vault: Address;
}

export interface StrategyPositionSnapshot {
  strategyId: Address;
  /** Position value in asset base units. */
  amount: string;
}

export interface StrategyPositionsSnapshot {
  vault: Address;
  /** Vault total value across idle assets and all strategies, in asset base units. */
  totalValue: string;
  strategies: StrategyPositionSnapshot[];
}

/**
 * Reads a vault's total value and its per-strategy position values. Returns
 * JSON-serializable data suitable for CLI formatting.
 */
export async function queryStrategyPositions(
  ctx: ScriptContext,
  args: QueryStrategyPositionsArgs
): Promise<StrategyPositionsSnapshot> {
  const { totalValue, strategies } = await getPositionAndTotalValuesForVault(
    ctx.rpc,
    args.vault
  );

  return {
    vault: args.vault,
    totalValue: totalValue.toString(),
    strategies: strategies.map((strategy) => ({
      strategyId: strategy.strategyId,
      amount: strategy.amount.toString(),
    })),
  };
}

export interface ProtocolConfigSnapshot {
  protocol: Address;
  admin: Address;
  pendingAdmin: Address;
  treasury: Address;
  operationalState: number;
  harvestEnabled: boolean;
}

/** Reads the live protocol account and derives the harvest-fee feature flag. */
export async function queryProtocolConfig(
  ctx: ScriptContext
): Promise<ProtocolConfigSnapshot> {
  const [protocol] = await findProtocolPda();
  const protocolAccount = await fetchProtocol(ctx.rpc, protocol);
  const { admin, pendingAdmin, treasury, operationalState } =
    protocolAccount.data;

  return {
    protocol,
    admin,
    pendingAdmin,
    treasury,
    operationalState,
    harvestEnabled:
      (operationalState & HARVEST_FEE_OPERATIONAL_STATE) !== 0,
  };
}

export interface ProtocolFeeVaultSnapshot {
  vault: Address;
  name: string;
  version: number;
  assetMint: Address;
  lpMint: Address;
  /** asset base units */
  totalValue: string;
  admin: Address;
  manager: Address;
  protocolPerformanceFeeBps: number;
  protocolManagementFeeBps: number;
  adminPerformanceFeeBps: number;
  adminManagementFeeBps: number;
  managerPerformanceFeeBps: number;
  managerManagementFeeBps: number;
  /** LP base units */
  accruedLpAdminFees: string;
  accruedLpManagerFees: string;
  accruedLpProtocolFees: string;
  lastManagementFeeUpdateTs: string;
  harvestDisabled: boolean;
}

export interface ProtocolFeeVaultsSnapshot {
  protocol: ProtocolConfigSnapshot;
  totalVaults: number;
  vaults: Array<ProtocolFeeVaultSnapshot>;
}

export interface QueryProtocolFeeVaultsArgs {
  /** Restrict to these vaults (still filtered to protocol-fee vaults). */
  vaults?: Array<Address>;
}

function toProtocolFeeVaultSnapshot(
  vaultAccount: Account<Vault>
): ProtocolFeeVaultSnapshot {
  const vault = vaultAccount.data;
  return {
    vault: vaultAccount.address,
    name: decodeVaultName(vault.name),
    version: vault.version,
    assetMint: vault.asset.mint,
    lpMint: vault.lp.mint,
    totalValue: vault.asset.totalValue.toString(),
    admin: vault.admin,
    manager: vault.manager,
    protocolPerformanceFeeBps:
      vault.feeConfiguration.protocolPerformanceFee,
    protocolManagementFeeBps:
      vault.feeConfiguration.protocolManagementFee,
    adminPerformanceFeeBps: vault.feeConfiguration.adminPerformanceFee,
    adminManagementFeeBps: vault.feeConfiguration.adminManagementFee,
    managerPerformanceFeeBps: vault.feeConfiguration.managerPerformanceFee,
    managerManagementFeeBps: vault.feeConfiguration.managerManagementFee,
    accruedLpAdminFees:
      vault.feeState.accumulatedLpAdminFees.toString(),
    accruedLpManagerFees:
      vault.feeState.accumulatedLpManagerFees.toString(),
    accruedLpProtocolFees:
      vault.feeState.accumulatedLpProtocolFees.toString(),
    lastManagementFeeUpdateTs:
      vault.feeUpdate.lastManagementFeeUpdateTs.toString(),
    harvestDisabled:
      (vault.vaultConfiguration.disabledOperations &
        HARVEST_FEE_DISABLED_OPERATION) !==
      0,
  };
}

/** Reads every vault and returns those with a configured protocol fee. */
export async function queryProtocolFeeVaults(
  ctx: ScriptContext,
  args: QueryProtocolFeeVaultsArgs = {}
): Promise<ProtocolFeeVaultsSnapshot> {
  const [protocol, vaultAccounts] = await Promise.all([
    queryProtocolConfig(ctx),
    fetchAllVaultAccounts(ctx),
  ]);
  const vaultFilter = args.vaults
    ? new Set(args.vaults.map((vault) => String(vault)))
    : undefined;

  const vaults = vaultAccounts
    .filter(
      (vaultAccount) =>
        (!vaultFilter || vaultFilter.has(String(vaultAccount.address))) &&
        (vaultAccount.data.feeConfiguration.protocolPerformanceFee > 0 ||
          vaultAccount.data.feeConfiguration.protocolManagementFee > 0)
    )
    .map(toProtocolFeeVaultSnapshot)
    .sort(
      (left, right) =>
        compareStrings(left.name, right.name) ||
        compareStrings(String(left.vault), String(right.vault))
    );

  return {
    protocol,
    totalVaults: vaultAccounts.length,
    vaults,
  };
}

import {
  fetchMaybeToken,
  fetchMint,
  findAssociatedTokenPda,
  TOKEN_PROGRAM_ADDRESS,
} from "@solana-program/token";
import {
  calculateAssetsForWithdraw,
  fetchVault,
  findVaultLpMintPda,
  getPositionAndTotalValuesForVault,
} from "@voltr/vault-sdk";
import type { Address } from "@solana/kit";
import type { ScriptContext } from "../types.js";

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

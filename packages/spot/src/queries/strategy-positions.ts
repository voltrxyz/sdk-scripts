import type { Address } from "@solana/kit";
import { findAssociatedTokenPda } from "@solana-program/token";
import {
  fetchAllStrategyInitReceiptAccountsOfVault,
  fetchVault,
  findVaultStrategyAuthPda,
} from "@voltr/vault-sdk";
import type { ScriptContext } from "@voltr/scripts-core";

export interface SpotStrategyAllocation {
  /** The strategy init receipt account address. */
  address: Address;
  /** The strategy address — the foreign mint for Spot, the lending PDA for Earn. */
  strategy: Address;
  /** Last refreshed position value, denominated in the vault asset (raw units). */
  positionValue: string;
  /**
   * Current raw balance of the strategy's foreign token account, denominated in
   * the foreign asset. `null` when the strategy is not a token mint (e.g. a
   * Jupiter Earn lending position) or the token account cannot be read.
   */
  currentRawForeignAmount: string | null;
}

export interface SpotStrategyPositions {
  vault: Address;
  /** Total value held by the vault, denominated in the vault asset (raw units). */
  vaultTotalValue: string;
  allocations: SpotStrategyAllocation[];
}

export interface QuerySpotStrategyPositionsArgs {
  vault: Address;
}

/**
 * `spot:query:strategy-positions` — read a vault's total value and every
 * strategy allocation, augmenting each with the current raw foreign-token
 * balance where the strategy is backed by a token mint.
 *
 * Migrated from `query-strategy-positions.ts` (with Spot-specific foreign
 * balance lookup), reshaped to return structured data instead of logging.
 */
export async function querySpotStrategyPositions(
  ctx: ScriptContext,
  args: QuerySpotStrategyPositionsArgs
): Promise<SpotStrategyPositions> {
  const vaultAccount = await fetchVault(ctx.rpc, args.vault);
  const allocations = await fetchAllStrategyInitReceiptAccountsOfVault(
    ctx.rpc,
    args.vault
  );

  const positions: SpotStrategyAllocation[] = [];
  for (const allocation of allocations) {
    const strategy = allocation.data.strategy;
    positions.push({
      address: allocation.address,
      strategy,
      positionValue: allocation.data.positionValue.toString(),
      currentRawForeignAmount: await readForeignAmount(ctx, args.vault, strategy),
    });
  }

  return {
    vault: args.vault,
    vaultTotalValue: vaultAccount.data.asset.totalValue.toString(),
    allocations: positions,
  };
}

/**
 * Resolves the strategy's foreign token account (owned by the strategy auth) and
 * returns its raw balance. The owning token program is taken from the strategy
 * mint account itself, mirroring the legacy script. Returns `null` for non-token
 * strategies or unreadable accounts.
 */
async function readForeignAmount(
  ctx: ScriptContext,
  vault: Address,
  strategy: Address
): Promise<string | null> {
  const strategyAccount = await ctx.rpc
    .getAccountInfo(strategy, { encoding: "base64" })
    .send();
  const tokenProgram = strategyAccount.value?.owner;
  if (!tokenProgram) {
    return null;
  }

  const [strategyAuthority] = await findVaultStrategyAuthPda({ vault, strategy });
  const [strategyForeignAta] = await findAssociatedTokenPda({
    owner: strategyAuthority,
    mint: strategy,
    tokenProgram,
  });

  try {
    const balance = await ctx.rpc
      .getTokenAccountBalance(strategyForeignAta)
      .send();
    return balance.value.amount;
  } catch {
    return null;
  }
}

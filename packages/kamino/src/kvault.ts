import { VaultState, Reserve } from "@kamino-finance/klend-sdk";
import { findAssociatedTokenPda, TOKEN_PROGRAM_ADDRESS } from "@solana-program/token";
import type { AccountMeta, Address } from "@solana/kit";
import type { SolanaRpc } from "@voltr/scripts-core";
import { readonlyAccount, writableAccount } from "./account-meta.js";
import {
  asKitAddress,
  DEFAULT_ADDRESS,
  KLEND_PROGRAM_ID,
  KVAULTS_PROGRAM_ID,
  SYSVAR_INSTRUCTIONS_ADDRESS,
} from "./constants.js";
import {
  findKvaultBaseVaultAuthorityPda,
  findKvaultCtokenVaultPda,
  findKvaultEventAuthorityPda,
  findKvaultGlobalConfigPda,
  findKvaultSharesMintPda,
  findKvaultTokenVaultPda,
  findLendingMarketAuthorityPda,
  findReserveCollateralMintPda,
  findReserveLiquiditySupplyPda,
} from "./pda.js";

async function fetchVaultState(
  rpc: SolanaRpc,
  kvault: Address
): Promise<VaultState> {
  const { value } = await rpc
    .getAccountInfo(kvault, { encoding: "base64" })
    .send();
  if (!value) {
    throw new Error(`Kamino kvault account ${kvault} was not found`);
  }
  return VaultState.decode(Buffer.from(value.data[0], "base64"));
}

/**
 * The kvault's allocated reserves, expanded into the `[reserve, lendingMarket]`
 * remaining-account pairs the adaptor expects, plus the most-allocated reserve
 * (used as the withdraw target) and the vault's own lookup table.
 */
export interface KvaultReserves {
  reserveAccountMetas: AccountMeta[];
  lendingMarketAccountMetas: AccountMeta[];
  maxAllocatedReserve: Address;
  maxAllocatedLendingMarket: Address;
  vaultLookupTable: Address;
}

export async function loadKvaultReserves(
  rpc: SolanaRpc,
  kvault: Address
): Promise<KvaultReserves> {
  const vaultState = await fetchVaultState(rpc, kvault);
  const vaultLookupTable = asKitAddress(vaultState.vaultLookupTable);

  const allocations = vaultState.vaultAllocationStrategy.filter(
    (allocation) => asKitAddress(allocation.reserve) !== DEFAULT_ADDRESS
  );
  const reserves = allocations.map((allocation) =>
    asKitAddress(allocation.reserve)
  );

  const lendingMarkets: Address[] = [];
  if (reserves.length > 0) {
    const { value } = await rpc
      .getMultipleAccounts(reserves, { encoding: "base64" })
      .send();
    value.forEach((account, index) => {
      if (!account) {
        throw new Error(`Kamino reserve ${reserves[index]} was not found`);
      }
      const reserve = Reserve.decode(Buffer.from(account.data[0], "base64"));
      lendingMarkets.push(asKitAddress(reserve.lendingMarket));
    });
  }

  // Highest target-allocation-weight reserve, matching the legacy selection.
  let maxIndex = -1;
  let maxWeight = 0n;
  allocations.forEach((allocation, index) => {
    const weight = BigInt(allocation.targetAllocationWeight.toString());
    if (weight > maxWeight) {
      maxWeight = weight;
      maxIndex = index;
    }
  });
  if (maxIndex < 0) {
    throw new Error(
      `Kamino kvault ${kvault} has no reserve with a positive target allocation weight`
    );
  }

  return {
    reserveAccountMetas: reserves.map(writableAccount),
    lendingMarketAccountMetas: lendingMarkets.map(readonlyAccount),
    maxAllocatedReserve: reserves[maxIndex],
    maxAllocatedLendingMarket: lendingMarkets[maxIndex],
    vaultLookupTable,
  };
}

/** Shared kvault PDAs and the strategy's shares ATA. */
interface KvaultCommonAccounts {
  sharesMint: Address;
  vaultStrategySharesAta: Address;
  tokenVault: Address;
  baseVaultAuthority: Address;
  eventAuthority: Address;
}

async function loadKvaultCommonAccounts(
  kvault: Address,
  vaultStrategyAuth: Address
): Promise<KvaultCommonAccounts> {
  const sharesMint = await findKvaultSharesMintPda(kvault);
  const [vaultStrategySharesAta] = await findAssociatedTokenPda({
    owner: vaultStrategyAuth,
    mint: sharesMint,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  });
  const tokenVault = await findKvaultTokenVaultPda(kvault);
  const baseVaultAuthority = await findKvaultBaseVaultAuthorityPda(kvault);
  const eventAuthority = await findKvaultEventAuthorityPda();
  return {
    sharesMint,
    vaultStrategySharesAta,
    tokenVault,
    baseVaultAuthority,
    eventAuthority,
  };
}

export interface KvaultStrategyAccounts {
  sharesMint: Address;
  vaultStrategySharesAta: Address;
  remaining: AccountMeta[];
  vaultLookupTable: Address;
}

/** Remaining accounts for a kvault deposit-strategy CPI. */
export async function buildKvaultDepositAccounts(
  rpc: SolanaRpc,
  params: { kvault: Address; vaultStrategyAuth: Address }
): Promise<KvaultStrategyAccounts> {
  const common = await loadKvaultCommonAccounts(
    params.kvault,
    params.vaultStrategyAuth
  );
  const { reserveAccountMetas, lendingMarketAccountMetas, vaultLookupTable } =
    await loadKvaultReserves(rpc, params.kvault);

  const remaining: AccountMeta[] = [
    writableAccount(params.kvault),
    writableAccount(common.tokenVault),
    readonlyAccount(common.baseVaultAuthority),
    writableAccount(common.sharesMint),
    writableAccount(common.vaultStrategySharesAta),
    readonlyAccount(common.eventAuthority),
    readonlyAccount(KLEND_PROGRAM_ID),
    readonlyAccount(KVAULTS_PROGRAM_ID),
    readonlyAccount(TOKEN_PROGRAM_ADDRESS),
    ...reserveAccountMetas,
    ...lendingMarketAccountMetas,
  ];

  return {
    sharesMint: common.sharesMint,
    vaultStrategySharesAta: common.vaultStrategySharesAta,
    remaining,
    vaultLookupTable,
  };
}

/**
 * Remaining accounts for a kvault withdraw-strategy / direct-withdraw CPI.
 * Shared by `kvault:withdraw`, `user:direct-withdraw`, and
 * `user:request-and-direct-withdraw`.
 */
export async function buildKvaultWithdrawAccounts(
  rpc: SolanaRpc,
  params: { kvault: Address; assetMint: Address; vaultStrategyAuth: Address }
): Promise<KvaultStrategyAccounts> {
  const common = await loadKvaultCommonAccounts(
    params.kvault,
    params.vaultStrategyAuth
  );
  const globalConfig = await findKvaultGlobalConfigPda(params.kvault);
  const {
    reserveAccountMetas,
    lendingMarketAccountMetas,
    maxAllocatedReserve,
    maxAllocatedLendingMarket,
    vaultLookupTable,
  } = await loadKvaultReserves(rpc, params.kvault);

  const lendingMarketAuthority = await findLendingMarketAuthorityPda(
    maxAllocatedLendingMarket
  );
  const reserveLiquiditySupply = await findReserveLiquiditySupplyPda(
    maxAllocatedLendingMarket,
    params.assetMint
  );
  const reserveCollateralMint = await findReserveCollateralMintPda(
    maxAllocatedLendingMarket,
    params.assetMint
  );
  const ctokenVault = await findKvaultCtokenVaultPda(
    params.kvault,
    maxAllocatedReserve
  );

  const remaining: AccountMeta[] = [
    writableAccount(params.kvault),
    readonlyAccount(globalConfig),
    writableAccount(common.tokenVault),
    readonlyAccount(common.baseVaultAuthority),
    writableAccount(common.sharesMint),
    writableAccount(common.vaultStrategySharesAta),
    writableAccount(maxAllocatedReserve),
    writableAccount(ctokenVault),
    readonlyAccount(maxAllocatedLendingMarket),
    readonlyAccount(lendingMarketAuthority),
    writableAccount(reserveLiquiditySupply),
    writableAccount(reserveCollateralMint),
    readonlyAccount(common.eventAuthority),
    readonlyAccount(KLEND_PROGRAM_ID),
    readonlyAccount(KVAULTS_PROGRAM_ID),
    readonlyAccount(TOKEN_PROGRAM_ADDRESS),
    readonlyAccount(SYSVAR_INSTRUCTIONS_ADDRESS),
    ...reserveAccountMetas,
    ...lendingMarketAccountMetas,
  ];

  return {
    sharesMint: common.sharesMint,
    vaultStrategySharesAta: common.vaultStrategySharesAta,
    remaining,
    vaultLookupTable,
  };
}

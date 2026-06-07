import { Reserve } from "@kamino-finance/klend-sdk";
import type { Address } from "@solana/kit";
import type { SolanaRpc } from "@voltr/scripts-core";
import {
  asKitAddress,
  DEFAULT_ADDRESS,
  KLEND_PROGRAM_ID,
} from "./constants.js";
import {
  findFarmUserStatePda,
  findLendingMarketAuthorityPda,
  findObligationPda,
  findUserMetadataPda,
} from "./pda.js";

/**
 * Decode a klend `Reserve` account using the SDK's pure Borsh decoder.
 *
 * We deliberately avoid the SDK's rpc-coupled helpers (`getSingleReserve`,
 * `Reserve.fetch`): the SDK targets an older `@solana/kit` major, so passing
 * our rpc into it risks a runtime/type mismatch. Instead we fetch raw bytes
 * with the repo's kit rpc and hand them to the version-agnostic decoder.
 */
async function fetchReserve(rpc: SolanaRpc, reserve: Address): Promise<Reserve> {
  const { value } = await rpc
    .getAccountInfo(reserve, { encoding: "base64" })
    .send();
  if (!value) {
    throw new Error(`Kamino reserve account ${reserve} was not found`);
  }
  return Reserve.decode(Buffer.from(value.data[0], "base64"));
}

/**
 * All accounts a market (klend reserve) operation needs, derived once and
 * shared by the init / deposit / withdraw / claim-reward builders. Each builder
 * orders these into its own remaining-account list.
 */
export interface MarketReserveAccounts {
  reserve: Address;
  lendingMarket: Address;
  lendingMarketAuthority: Address;
  obligation: Address;
  userMetadata: Address;
  /** klend liquidity supply vault (`reserve.liquidity.supplyVault`). */
  reserveLiquiditySupply: Address;
  /** klend collateral mint (`reserve.collateral.mintPubkey`). */
  reserveCollateralMint: Address;
  /**
   * klend collateral supply vault (`reserve.collateral.supplyVault`). This is
   * the deposit destination and the withdraw source collateral account.
   */
  reserveCollateralSupplyVault: Address;
  /** Scope price feed for this reserve. */
  scope: Address;
  /**
   * Reserve farm + obligation farm state. When the reserve has no collateral
   * farm, both fall back to the klend program id (the adaptor's no-farm sentinel).
   */
  reserveFarmState: Address;
  obligationFarm: Address;
}

export async function loadMarketReserveAccounts(
  rpc: SolanaRpc,
  params: { reserve: Address; vaultStrategyAuth: Address }
): Promise<MarketReserveAccounts> {
  const reserve = await fetchReserve(rpc, params.reserve);

  const lendingMarket = asKitAddress(reserve.lendingMarket);
  const obligation = await findObligationPda(
    params.vaultStrategyAuth,
    lendingMarket
  );
  const lendingMarketAuthority =
    await findLendingMarketAuthorityPda(lendingMarket);
  const userMetadata = await findUserMetadataPda(params.vaultStrategyAuth);

  const farmCollateral = asKitAddress(reserve.farmCollateral);
  const hasFarm = farmCollateral !== DEFAULT_ADDRESS;
  const reserveFarmState = hasFarm ? farmCollateral : KLEND_PROGRAM_ID;
  const obligationFarm = hasFarm
    ? await findFarmUserStatePda(farmCollateral, obligation)
    : KLEND_PROGRAM_ID;

  return {
    reserve: params.reserve,
    lendingMarket,
    lendingMarketAuthority,
    obligation,
    userMetadata,
    reserveLiquiditySupply: asKitAddress(reserve.liquidity.supplyVault),
    reserveCollateralMint: asKitAddress(reserve.collateral.mintPubkey),
    reserveCollateralSupplyVault: asKitAddress(reserve.collateral.supplyVault),
    scope: asKitAddress(reserve.config.tokenInfo.scopeConfiguration.priceFeed),
    reserveFarmState,
    obligationFarm,
  };
}

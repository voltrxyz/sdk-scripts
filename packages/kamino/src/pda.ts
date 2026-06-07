import {
  getAddressEncoder,
  getProgramDerivedAddress,
  type Address,
} from "@solana/kit";
import {
  FARMS_PROGRAM_ID,
  KLEND_PROGRAM_ID,
  KVAULTS_PROGRAM_ID,
  SYSTEM_PROGRAM_ID,
} from "./constants.js";

const addressEncoder = getAddressEncoder();

// Borrow kit's own seed element type so address-encoder output (a
// ReadonlyUint8Array) and string literals both type-check across kit versions.
type Seed = Parameters<typeof getProgramDerivedAddress>[0]["seeds"][number];

async function derive(
  programAddress: Address,
  seeds: Seed[]
): Promise<Address> {
  const [pda] = await getProgramDerivedAddress({ programAddress, seeds });
  return pda;
}

// --- klend (Kamino Lending) PDAs ---

/**
 * The vault strategy authority's obligation in a klend market. The klend
 * obligation seed layout is: two zero bytes (tag, id), owner, market, then two
 * system-program "no referrer / no owner" placeholders.
 */
export function findObligationPda(
  owner: Address,
  lendingMarket: Address
): Promise<Address> {
  return derive(KLEND_PROGRAM_ID, [
    new Uint8Array([0]),
    new Uint8Array([0]),
    addressEncoder.encode(owner),
    addressEncoder.encode(lendingMarket),
    addressEncoder.encode(SYSTEM_PROGRAM_ID),
    addressEncoder.encode(SYSTEM_PROGRAM_ID),
  ]);
}

export function findLendingMarketAuthorityPda(
  lendingMarket: Address
): Promise<Address> {
  return derive(KLEND_PROGRAM_ID, ["lma", addressEncoder.encode(lendingMarket)]);
}

export function findUserMetadataPda(owner: Address): Promise<Address> {
  return derive(KLEND_PROGRAM_ID, ["user_meta", addressEncoder.encode(owner)]);
}

export function findReserveLiquiditySupplyPda(
  lendingMarket: Address,
  mint: Address
): Promise<Address> {
  return derive(KLEND_PROGRAM_ID, [
    "reserve_liq_supply",
    addressEncoder.encode(lendingMarket),
    addressEncoder.encode(mint),
  ]);
}

export function findReserveCollateralMintPda(
  lendingMarket: Address,
  mint: Address
): Promise<Address> {
  return derive(KLEND_PROGRAM_ID, [
    "reserve_coll_mint",
    addressEncoder.encode(lendingMarket),
    addressEncoder.encode(mint),
  ]);
}

// --- farms PDAs ---

/** The user (obligation) state for a reserve's collateral farm. */
export function findFarmUserStatePda(
  farmState: Address,
  obligation: Address
): Promise<Address> {
  return derive(FARMS_PROGRAM_ID, [
    "user",
    addressEncoder.encode(farmState),
    addressEncoder.encode(obligation),
  ]);
}

export function findFarmRewardsVaultPda(
  farmState: Address,
  rewardMint: Address
): Promise<Address> {
  return derive(FARMS_PROGRAM_ID, [
    "rvault",
    addressEncoder.encode(farmState),
    addressEncoder.encode(rewardMint),
  ]);
}

export function findFarmVaultsAuthorityPda(farmState: Address): Promise<Address> {
  return derive(FARMS_PROGRAM_ID, ["authority", addressEncoder.encode(farmState)]);
}

export function findFarmRewardsTreasuryVaultPda(
  globalConfig: Address,
  rewardMint: Address
): Promise<Address> {
  return derive(FARMS_PROGRAM_ID, [
    "tvault",
    addressEncoder.encode(globalConfig),
    addressEncoder.encode(rewardMint),
  ]);
}

// --- kvault (Kamino Vaults) PDAs ---

export function findKvaultSharesMintPda(kvault: Address): Promise<Address> {
  return derive(KVAULTS_PROGRAM_ID, ["shares", addressEncoder.encode(kvault)]);
}

export function findKvaultTokenVaultPda(kvault: Address): Promise<Address> {
  return derive(KVAULTS_PROGRAM_ID, [
    "token_vault",
    addressEncoder.encode(kvault),
  ]);
}

export function findKvaultBaseVaultAuthorityPda(
  kvault: Address
): Promise<Address> {
  return derive(KVAULTS_PROGRAM_ID, ["authority", addressEncoder.encode(kvault)]);
}

export function findKvaultEventAuthorityPda(): Promise<Address> {
  return derive(KVAULTS_PROGRAM_ID, ["__event_authority"]);
}

export function findKvaultGlobalConfigPda(kvault: Address): Promise<Address> {
  return derive(KVAULTS_PROGRAM_ID, [
    "global_config",
    addressEncoder.encode(kvault),
  ]);
}

export function findKvaultCtokenVaultPda(
  kvault: Address,
  reserve: Address
): Promise<Address> {
  return derive(KVAULTS_PROGRAM_ID, [
    "ctoken_vault",
    addressEncoder.encode(kvault),
    addressEncoder.encode(reserve),
  ]);
}

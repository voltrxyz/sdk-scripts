import {
  getAddressEncoder,
  getProgramDerivedAddress,
  type Address,
} from "@solana/kit";
import { findAssociatedTokenPda } from "@solana-program/token";
import { findVaultStrategyAuthPda } from "@voltr/vault-sdk";
import {
  ADAPTOR_PROGRAM_ID,
  JUPITER_LEND_PROGRAM_ID,
  JUPITER_LIQUIDITY_PROGRAM_ID,
  JUPITER_REWARDS_RATE_PROGRAM_ID,
  SEEDS,
} from "./constants.js";

const addressEncoder = getAddressEncoder();

/**
 * The Spot adaptor's per-(strategy-auth, mint) oracle init receipt. One is
 * derived for the vault asset and one for the foreign asset.
 */
export async function findSpotOracleInitReceiptPda(args: {
  vaultStrategyAuth: Address;
  mint: Address;
}): Promise<Address> {
  const [pda] = await getProgramDerivedAddress({
    programAddress: ADAPTOR_PROGRAM_ID,
    seeds: [
      SEEDS.ORACLE_INIT_RECEIPT,
      addressEncoder.encode(args.vaultStrategyAuth),
      addressEncoder.encode(args.mint),
    ],
  });
  return pda;
}

/**
 * Every account the Jupiter Earn (lending) strategy touches. The strategy
 * address itself is the Jupiter `lending` PDA, so callers that need the vault
 * strategy auth derive it from `lending`.
 */
export interface JupiterEarnAccounts {
  fTokenMint: Address;
  lendingAdmin: Address;
  lending: Address;
  supplyTokenReservesLiquidity: Address;
  rateModel: Address;
  userClaim: Address;
  liquidity: Address;
  rewardsRateModel: Address;
  lendingSupplyPositionOnLiquidity: Address;
  vaultStrategyAuth: Address;
  vaultStrategyFTokenAta: Address;
  jVault: Address;
}

export async function deriveJupiterEarnAccounts(args: {
  vault: Address;
  assetMint: Address;
  assetTokenProgram: Address;
}): Promise<JupiterEarnAccounts> {
  const { assetMint } = args;

  const [fTokenMint] = await getProgramDerivedAddress({
    programAddress: JUPITER_LEND_PROGRAM_ID,
    seeds: [SEEDS.F_TOKEN_MINT, addressEncoder.encode(assetMint)],
  });
  const [lendingAdmin] = await getProgramDerivedAddress({
    programAddress: JUPITER_LEND_PROGRAM_ID,
    seeds: [SEEDS.LENDING_ADMIN],
  });
  const [lending] = await getProgramDerivedAddress({
    programAddress: JUPITER_LEND_PROGRAM_ID,
    seeds: [
      SEEDS.LENDING,
      addressEncoder.encode(assetMint),
      addressEncoder.encode(fTokenMint),
    ],
  });
  const [supplyTokenReservesLiquidity] = await getProgramDerivedAddress({
    programAddress: JUPITER_LIQUIDITY_PROGRAM_ID,
    seeds: [SEEDS.RESERVE, addressEncoder.encode(assetMint)],
  });
  const [rateModel] = await getProgramDerivedAddress({
    programAddress: JUPITER_LIQUIDITY_PROGRAM_ID,
    seeds: [SEEDS.RATE_MODEL, addressEncoder.encode(assetMint)],
  });
  const [userClaim] = await getProgramDerivedAddress({
    programAddress: JUPITER_LIQUIDITY_PROGRAM_ID,
    seeds: [
      SEEDS.USER_CLAIM,
      addressEncoder.encode(lendingAdmin),
      addressEncoder.encode(assetMint),
    ],
  });
  const [liquidity] = await getProgramDerivedAddress({
    programAddress: JUPITER_LIQUIDITY_PROGRAM_ID,
    seeds: [SEEDS.LIQUIDITY],
  });
  const [rewardsRateModel] = await getProgramDerivedAddress({
    programAddress: JUPITER_REWARDS_RATE_PROGRAM_ID,
    seeds: [SEEDS.LENDING_REWARDS_RATE_MODEL, addressEncoder.encode(assetMint)],
  });
  const [lendingSupplyPositionOnLiquidity] = await getProgramDerivedAddress({
    programAddress: JUPITER_LIQUIDITY_PROGRAM_ID,
    seeds: [
      SEEDS.USER_SUPPLY_POSITION,
      addressEncoder.encode(assetMint),
      addressEncoder.encode(lending),
    ],
  });

  const [vaultStrategyAuth] = await findVaultStrategyAuthPda({
    vault: args.vault,
    strategy: lending,
  });

  const [vaultStrategyFTokenAta] = await findAssociatedTokenPda({
    owner: vaultStrategyAuth,
    mint: fTokenMint,
    tokenProgram: args.assetTokenProgram,
  });
  const [jVault] = await findAssociatedTokenPda({
    owner: liquidity,
    mint: assetMint,
    tokenProgram: args.assetTokenProgram,
  });

  return {
    fTokenMint,
    lendingAdmin,
    lending,
    supplyTokenReservesLiquidity,
    rateModel,
    userClaim,
    liquidity,
    rewardsRateModel,
    lendingSupplyPositionOnLiquidity,
    vaultStrategyAuth,
    vaultStrategyFTokenAta,
    jVault,
  };
}

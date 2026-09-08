import {
  getAddressEncoder,
  getProgramDerivedAddress,
  getUtf8Encoder,
  type Address,
} from "@solana/kit";
import {
  findAssociatedTokenPda,
  TOKEN_PROGRAM_ADDRESS,
} from "@solana-program/token";
import {
  findStrategyInitReceiptPda,
  findVaultStrategyAuthPda,
} from "@voltr/vault-sdk";
import { findUserBundleAccountPda } from "./generated/pdas/userBundleAccount.js";
import { NEUTRAL_SEEDS, NTBUNDLE_PROGRAM_ID } from "./constants.js";

export interface NeutralBundleAccounts {
  vaultStrategyAuth: Address;
  strategyInitReceipt: Address;
  userBundleAccount: Address;
  oracleData: Address;
  bundleTempData: Address;
  pendingBundleAssetAuthority: Address;
  vaultStrategyAssetAta: Address;
  pendingDepositTokenAccount: Address;
}

export async function deriveNeutralBundleAccounts(
  vault: Address,
  bundle: Address,
  assetMint: Address
): Promise<NeutralBundleAccounts> {
  const [vaultStrategyAuth] = await findVaultStrategyAuthPda({
    vault,
    strategy: bundle,
  });
  const [strategyInitReceipt] = await findStrategyInitReceiptPda({
    vault,
    strategy: bundle,
  });
  const [userBundleAccount] = await findUserBundleAccountPda({
    authority: vaultStrategyAuth,
    bundleAccount: bundle,
  });
  const derive = async (seed: string) =>
    (
      await getProgramDerivedAddress({
        programAddress: NTBUNDLE_PROGRAM_ID,
        seeds: [
          getUtf8Encoder().encode(seed),
          getAddressEncoder().encode(bundle),
        ],
      })
    )[0];
  const [oracleData, bundleTempData, pendingBundleAssetAuthority] =
    await Promise.all([
      derive(NEUTRAL_SEEDS.ORACLE),
      derive(NEUTRAL_SEEDS.TEMP),
      derive(NEUTRAL_SEEDS.PENDING_AUTHORITY),
    ]);
  const [vaultStrategyAssetAta] = await findAssociatedTokenPda({
    owner: vaultStrategyAuth,
    mint: assetMint,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  });
  const [pendingDepositTokenAccount] = await findAssociatedTokenPda({
    owner: pendingBundleAssetAuthority,
    mint: assetMint,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  });
  return {
    vaultStrategyAuth,
    strategyInitReceipt,
    userBundleAccount,
    oracleData,
    bundleTempData,
    pendingBundleAssetAuthority,
    vaultStrategyAssetAta,
    pendingDepositTokenAccount,
  };
}

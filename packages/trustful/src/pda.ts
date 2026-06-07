import {
  getAddressEncoder,
  getProgramDerivedAddress,
  getUtf8Encoder,
  type Address,
} from "@solana/kit";
import { findAssociatedTokenPda } from "@solana-program/token";
import {
  findStrategyInitReceiptPda,
  findVaultStrategyAuthPda,
} from "@voltr/vault-sdk";
import { TRUSTFUL_ADAPTOR_PROGRAM_ID } from "./constants.js";

const addressEncoder = getAddressEncoder();

/**
 * The set of accounts every Trustful strategy operation derives from a vault +
 * strategy seed, centralizing the `findVaultStrategyAuthPda` and adaptor PDA
 * derivations each operation needs.
 */
export interface TrustfulStrategyAccounts {
  /** The adaptor strategy account (PDA of the seed under the adaptor program). */
  strategy: Address;
  /** Vault↔strategy authority (PDA owned by the vault program). */
  vaultStrategyAuth: Address;
  /** Strategy init receipt (PDA owned by the vault program). */
  strategyInitReceipt: Address;
  /**
   * Adaptor "withdrawal holding" authority — PDA of
   * `[vaultStrategyAuth, strategy]` under the adaptor program. Its asset ATA is
   * where strategy funds are parked so they can be pulled back into the vault.
   */
  withdrawalHoldingAuth: Address;
}

/** Derive an adaptor strategy account from a UTF-8 seed string. */
export async function deriveTrustfulStrategy(seed: string): Promise<Address> {
  const [strategy] = await getProgramDerivedAddress({
    programAddress: TRUSTFUL_ADAPTOR_PROGRAM_ID,
    seeds: [getUtf8Encoder().encode(seed)],
  });
  return strategy;
}

/**
 * Derive the adaptor withdrawal-holding authority for a `(vaultStrategyAuth,
 * strategy)` pair: `findProgramAddress([vaultStrategyAuth, strategy], adaptor)`.
 */
export async function deriveWithdrawalHoldingAuth(
  vaultStrategyAuth: Address,
  strategy: Address
): Promise<Address> {
  const [auth] = await getProgramDerivedAddress({
    programAddress: TRUSTFUL_ADAPTOR_PROGRAM_ID,
    seeds: [
      addressEncoder.encode(vaultStrategyAuth),
      addressEncoder.encode(strategy),
    ],
  });
  return auth;
}

/**
 * Derive every strategy-scoped account for a vault + seed in one call. Used by
 * the curve builders (where the seed is the constant {@link TRUSTFUL_SEEDS.CURVE})
 * and the arbitrary builders (where the seed comes from the profile/CLI).
 */
export async function deriveTrustfulStrategyAccounts(
  vault: Address,
  seed: string
): Promise<TrustfulStrategyAccounts> {
  const strategy = await deriveTrustfulStrategy(seed);
  const [vaultStrategyAuth] = await findVaultStrategyAuthPda({ vault, strategy });
  const [strategyInitReceipt] = await findStrategyInitReceiptPda({
    vault,
    strategy,
  });
  const withdrawalHoldingAuth = await deriveWithdrawalHoldingAuth(
    vaultStrategyAuth,
    strategy
  );
  return {
    strategy,
    vaultStrategyAuth,
    strategyInitReceipt,
    withdrawalHoldingAuth,
  };
}

/** Derive an associated token account address (no on-chain existence check). */
export async function deriveAssetAta(
  owner: Address,
  mint: Address,
  tokenProgram: Address
): Promise<Address> {
  const [ata] = await findAssociatedTokenPda({ owner, mint, tokenProgram });
  return ata;
}

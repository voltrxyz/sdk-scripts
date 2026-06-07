import { address, type Address } from "@solana/kit";

/**
 * Program IDs and on-chain constants used by every Kamino operation builder.
 *
 * These are the program IDs `@kamino-finance/klend-sdk` ships (`KLend2g3...`,
 * `Kvau...`) plus the Kamino farms program. They are kept here, in the adapter
 * package, so operation builders never reach into the SDK (which targets an
 * older `@solana/kit` major) for an `Address` constant.
 */

/** Voltr Kamino adaptor program that the vault CPIs into. */
export const KAMINO_ADAPTOR_PROGRAM_ID = address(
  "to6Eti9CsC5FGkAtqiPphvKD2hiQiLsS8zWiDBqBPKR"
);

/** Kamino Lending (klend) program. */
export const KLEND_PROGRAM_ID = address(
  "KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD"
);

/** Kamino Vaults (kvault) program. */
export const KVAULTS_PROGRAM_ID = address(
  "KvauGMspG5k6rtzrqqn7WNn3oZdyKqLKwK2XWQ8FLjd"
);

/** Kamino Farms program (reward farms attached to reserves / kvaults). */
export const FARMS_PROGRAM_ID = address(
  "FarmsPZpWu9i7Kky8tPN37rs2TpmMrAZrC7S7vJa91Hr"
);

/** Farms global config used when claiming farm rewards. */
export const FARM_GLOBAL_CONFIG = address(
  "6UodrBjL2ZreDy7QdR4YV1oxqMBjVYSEyrFpctqqwGwL"
);

/** Scope price feed account used by kvault reward claims. */
export const SCOPE = address("3NJYftD5sjVfxSnUdZ1wVML8f3aC6mp1CXCL6L7TnU8C");

/** The all-zero address (system program). Reserves with no farm report this. */
export const DEFAULT_ADDRESS = address("11111111111111111111111111111111");

/** System program, used as a PDA seed for the klend obligation. */
export const SYSTEM_PROGRAM_ID = address("11111111111111111111111111111111");

/** Rent sysvar (remaining account on market init / deposit). */
export const SYSVAR_RENT_ADDRESS = address(
  "SysvarRent111111111111111111111111111111111"
);

/** Instructions sysvar (remaining account on market/kvault deposit & withdraw). */
export const SYSVAR_INSTRUCTIONS_ADDRESS = address(
  "Sysvar1nstructions1111111111111111111111111"
);

/**
 * Adaptor instruction discriminators. The Voltr adaptor program multiplexes its
 * entrypoints on an 8-byte discriminator passed through the vault SDK's
 * `instructionDiscriminator` argument. Stored as plain number arrays; wrap with
 * `new Uint8Array(...)` at the call site so each instruction gets its own copy.
 */
export const KAMINO_DISCRIMINATOR = {
  INITIALIZE_VAULT: [48, 191, 163, 44, 71, 129, 63, 164],
  INITIALIZE_MARKET: [35, 35, 189, 193, 155, 48, 170, 203],
  DEPOSIT_VAULT: [126, 224, 21, 255, 228, 53, 117, 33],
  DEPOSIT_MARKET: [212, 53, 186, 193, 147, 53, 143, 123],
  WITHDRAW_VAULT: [135, 7, 237, 120, 149, 94, 95, 7],
  WITHDRAW_MARKET: [123, 109, 245, 15, 150, 48, 203, 113],
  CLAIM_VAULT_REWARDS: [0, 152, 75, 29, 195, 223, 12, 101],
  CLAIM_MARKET_REWARD: [63, 114, 108, 43, 215, 9, 27, 228],
  CLAIM_VAULT_REWARDS_WITH_INDEX: [254, 70, 236, 21, 190, 255, 37, 228],
  CLAIM_MARKET_REWARD_WITH_INDEX: [4, 87, 124, 11, 82, 236, 79, 33],
} as const satisfies Record<string, readonly number[]>;

export type KaminoDiscriminatorName = keyof typeof KAMINO_DISCRIMINATOR;

/** Re-brand any klend-sdk address-like value into a repo (`@solana/kit` v6) Address. */
export function asKitAddress(value: { toString(): string }): Address {
  return address(value.toString());
}

import { address, type Address } from "@solana/kit";

// The Voltr Spot/Jupiter-Earn adaptor program. Spot strategies and Jupiter Earn
// (lending) strategies are both driven through this single adaptor; the per-flow
// behavior is selected by the instruction discriminator passed to the vault SDK.
export const SPOT_ADAPTOR_PROGRAM_ID: Address = address(
  "EW35URAx3LiM13fFK3QxAXfGemHso9HWPixrv7YDY4AM"
);

// Jupiter Lend program family used by the Earn strategy.
export const JUPITER_LEND_PROGRAM_ID: Address = address(
  "jup3YeL8QhtSx1e253b2FDvsMNC87fDrgQZivbrndc9"
);
export const JUPITER_LIQUIDITY_PROGRAM_ID: Address = address(
  "jupeiUmn818Jg1ekPURTpr4mFo29p46vygyykFJ3wZC"
);
export const JUPITER_REWARDS_RATE_PROGRAM_ID: Address = address(
  "jup7TthsMgcR9Y3L277b8Eo9uboVSmu1utkuXHNUKar"
);

// PDA seed prefixes. String seeds are UTF-8 encoded by `getProgramDerivedAddress`.
export const SPOT_SEEDS = {
  // Spot adaptor
  ORACLE_INIT_RECEIPT: "oracle_init_receipt",
  // Jupiter Lend
  F_TOKEN_MINT: "f_token_mint",
  LENDING: "lending",
  LENDING_ADMIN: "lending_admin",
  // Jupiter Liquidity
  RESERVE: "reserve",
  RATE_MODEL: "rate_model",
  USER_CLAIM: "user_claim",
  LIQUIDITY: "liquidity",
  USER_SUPPLY_POSITION: "user_supply_position",
  // Jupiter Rewards Rate
  LENDING_REWARDS_RATE_MODEL: "lending_rewards_rate_model",
} as const;

/**
 * Adaptor instruction discriminators threaded through the vault SDK's
 * `initialize`/`deposit`/`withdraw` strategy instructions as
 * `instructionDiscriminator`. Stored as plain number arrays (matching the other
 * adapter packages); wrap with `new Uint8Array(...)` at the call site so each
 * instruction gets its own copy.
 */
export const SPOT_DISCRIMINATOR = {
  INITIALIZE_SPOT: [206, 194, 174, 21, 64, 192, 115, 9],
  SWAP_SPOT: [198, 133, 229, 32, 233, 2, 193, 212],
  INITIALIZE_JUPITER_EARN: [96, 41, 228, 66, 7, 63, 88, 208],
  DEPOSIT_JUPITER_EARN: [56, 2, 200, 235, 238, 139, 231, 190],
  WITHDRAW_JUPITER_EARN: [232, 204, 244, 40, 201, 192, 7, 194],
} as const satisfies Record<string, readonly number[]>;

// Default Jupiter swap API base: the lite (keyless) host.
export const JUPITER_SWAP_API_BASE = "https://lite-api.jup.ag/swap/v1";

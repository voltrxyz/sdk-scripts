import { address, type Address } from "@solana/kit";

/**
 * The Trustful adaptor program. Kept here so the adaptor program ID never leaks
 * into `packages/core` or sibling adapter packages — only `packages/trustful`
 * (and the future generic admin add/remove-adaptor helpers in VOL-224, which
 * import this constant) knows about it.
 */
export const TRUSTFUL_ADAPTOR_PROGRAM_ID: Address = address(
  "3pnpK9nrs1R65eMV1wqCXkDkhSgN18xb1G5pgYPwoZjJ"
);

/**
 * Strategy-account seeds understood by the Trustful adaptor.
 *
 * The arbitrary strategy is seeded by an operator-chosen string (the profile's
 * `integrations.trustful.strategySeedString`). The curve strategy is a
 * singleton seeded by the constant below.
 */
export const TRUSTFUL_SEEDS = {
  /** Singleton curve-strategy seed (matches the adaptor IDL's hard-coded seed). */
  CURVE: "curve",
} as const;

/**
 * Instruction discriminators.
 *
 * The first six are forwarded to the adaptor by the vault SDK's generic
 * `initialize`/`deposit`/`withdraw` strategy instructions (passed as
 * `instructionDiscriminator`). `TRANSFER_CURVE` is the adaptor's own
 * `transfer_curve` instruction, which the repay flow builds and CPIs directly
 * (see {@link file://./instructions.ts}).
 */
export const TRUSTFUL_DISCRIMINATOR = {
  INITIALIZE_ARBITRARY: [251, 45, 95, 238, 92, 108, 238, 129],
  DEPOSIT_ARBITRARY: [117, 73, 131, 148, 12, 99, 191, 180],
  WITHDRAW_ARBITRARY: [35, 58, 217, 109, 98, 184, 147, 14],
  INITIALIZE_CURVE: [170, 84, 186, 253, 131, 149, 95, 213],
  BORROW_CURVE: [90, 14, 246, 231, 99, 14, 124, 198],
  REPAY_CURVE: [36, 81, 59, 35, 131, 18, 177, 97],
  TRANSFER_CURVE: [233, 97, 132, 132, 247, 45, 78, 78],
} as const;

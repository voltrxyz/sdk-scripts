import type { Address } from "@solana/kit";

/**
 * Wrapped SOL mint. When a vault's asset is wSOL, deposit/withdraw builders
 * wrap native SOL into the user's wSOL ATA before the operation and unwrap it
 * (close the ATA) afterwards.
 */
export const NATIVE_MINT =
  "So11111111111111111111111111111111111111112" as Address;

/**
 * Mirrors `Protocol.treasury` on mainnet. The harvest instruction requires an
 * exact match; `protocol:harvest-fee` reads the live value instead of relying
 * on this constant.
 */
export const PROTOCOL_TREASURY =
  "C7sE3MjSAqqF7TgXn1VsNQPWem1gdhqv3ZYV9TNfSjY9" as Address;

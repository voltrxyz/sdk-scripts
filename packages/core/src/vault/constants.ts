import type { Address } from "@solana/kit";

/**
 * Wrapped SOL mint. When a vault's asset is wSOL, deposit/withdraw builders
 * wrap native SOL into the user's wSOL ATA before the operation and unwrap it
 * (close the ATA) afterwards.
 */
export const NATIVE_MINT =
  "So11111111111111111111111111111111111111112" as Address;

/**
 * Voltr protocol admin. Receives the protocol cut of harvested vault fees.
 * This is a fixed protocol-level value (not per-deployment), so it lives in
 * core rather than in a profile.
 */
export const PROTOCOL_ADMIN =
  "vxyzZyfd6nJ3v82fTSmuRiKF4owWF9sAXqneu9mne9n" as Address;

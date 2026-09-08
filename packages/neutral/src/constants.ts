import { createHash } from "node:crypto";
import { address } from "@solana/kit";
export { NTBUNDLE_PROGRAM_ADDRESS as NTBUNDLE_PROGRAM_ID } from "./generated/programs/ntbundle.js";

export const NEUTRAL_ADAPTOR_PROGRAM_ID = address(
  "WpFotU6LNA9Rdk9rm1ZYNcaPCRXHZGRLVwxHXqcaRJG"
);
export const NEUTRAL_DISCRIMINATOR = {
  REQUEST_WITHDRAW: Array.from(
    createHash("sha256")
      .update("global:request_withdraw")
      .digest()
      .subarray(0, 8)
  ),
};
export const NEUTRAL_SEEDS = {
  ORACLE: "ORACLE",
  TEMP: "BUNDLE_TEMP_DATA",
  PENDING_AUTHORITY: "PENDING_BUNDLE_ASSET_AUTHORITY",
} as const;
export const U64_MAX = 18_446_744_073_709_551_615n;

export function assertNeutralAmount(amount: bigint): void {
  if (amount <= 0n || amount > U64_MAX)
    throw new Error(
      "Neutral amount must be between 1 and u64::MAX asset minor units"
    );
}

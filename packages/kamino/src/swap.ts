import type { AccountMeta, Address } from "@solana/kit";
import { encodeU64Le } from "@voltr/scripts-core";

/**
 * A pre-resolved Jupiter swap, supplied to the claim-reward builders.
 *
 * Reward claims swap the harvested reward token into the vault asset inside the
 * same CPI: the adaptor embeds the raw Jupiter swap instruction data in its
 * `additionalArgs` and receives the swap's accounts as trailing remaining
 * accounts. Building that route requires an external Jupiter HTTP call, which
 * is a CLI-layer concern (out of scope here, see migration docs), so the
 * builders accept the already-resolved, `@solana/kit`-typed payload.
 *
 * When the reward mint equals the asset mint no swap is needed: pass an empty
 * `swapInstructionData` and `swapAccounts` (or omit the payload entirely).
 */
export interface KaminoJupiterSwap {
  /** Raw Jupiter swap instruction data (base64-decoded). */
  swapInstructionData: Uint8Array;
  /** Jupiter swap account metas (program id first), as non-signers. */
  swapAccounts: AccountMeta[];
  /** Address-lookup tables the Jupiter route depends on. */
  lookupTableAddresses?: Address[];
}

/**
 * Build the adaptor `additionalArgs` for a reward claim: an optional u64 LE
 * reward index prefix followed by the Jupiter swap data. Mirrors the legacy
 * `Buffer.concat([rewardIndexBuf, jupiterSwapData])` behavior.
 */
export function buildClaimAdditionalArgs(
  rewardIndex: number | undefined,
  swap: KaminoJupiterSwap | undefined
): Uint8Array {
  const swapData = swap?.swapInstructionData ?? new Uint8Array(0);
  if (rewardIndex === undefined) {
    return swapData;
  }
  const prefix = encodeU64Le(BigInt(rewardIndex));
  const out = new Uint8Array(prefix.length + swapData.length);
  out.set(prefix, 0);
  out.set(swapData, prefix.length);
  return out;
}

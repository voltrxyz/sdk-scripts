import type { AccountMeta, Address, Instruction } from "@solana/kit";

/**
 * Appends kit-native remaining accounts to an instruction. Unlike core's
 * `appendRemainingAccounts` (which converts web3.js metas), this works on
 * accounts that are already `@solana/kit` `AccountMeta` values — the Spot
 * package builds all of its remaining accounts directly in kit.
 */
export function appendRemainingAccounts(
  instruction: Instruction,
  remainingAccounts: readonly AccountMeta<Address>[]
): Instruction {
  return {
    ...instruction,
    accounts: [...(instruction.accounts ?? []), ...remainingAccounts],
  };
}

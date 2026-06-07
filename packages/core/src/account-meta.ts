import {
  AccountRole,
  type AccountMeta,
  type Address,
  type Instruction,
} from "@solana/kit";

/**
 * Kit-native account-meta helpers shared by every adapter package.
 *
 * Adapter CPIs (Kamino, Spot, Trustful) carry their protocol-specific accounts
 * as trailing *remaining accounts* after the fixed list the vault SDK builds.
 * These helpers construct those metas and splice them onto a kit instruction.
 *
 * This is the kit-native counterpart to `appendRemainingAccounts` in
 * `interop/web3-kit.ts` (which converts `@solana/web3.js` metas first). Use
 * these when the remaining accounts are already `@solana/kit` `Address` values;
 * use the web3 variant only at a `@solana/web3.js` compatibility boundary.
 */

/** A non-signer, read-only remaining account. */
export function readonlyAccount(address: Address): AccountMeta {
  return { address, role: AccountRole.READONLY };
}

/** A non-signer, writable remaining account. */
export function writableAccount(address: Address): AccountMeta {
  return { address, role: AccountRole.WRITABLE };
}

/**
 * Append remaining accounts to a kit instruction, preserving its existing
 * accounts (including any signer entries the SDK placed on it). The metas must
 * already be kit-typed; no web3.js conversion happens here.
 */
export function withRemainingAccounts(
  instruction: Instruction,
  remaining: readonly AccountMeta[]
): Instruction {
  return {
    ...instruction,
    accounts: [...(instruction.accounts ?? []), ...remaining],
  };
}

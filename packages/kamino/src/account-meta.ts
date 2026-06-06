import {
  AccountRole,
  type AccountMeta,
  type Address,
  type Instruction,
} from "@solana/kit";

/** A non-signer, read-only remaining account. */
export function readonlyAccount(address: Address): AccountMeta {
  return { address, role: AccountRole.READONLY };
}

/** A non-signer, writable remaining account. */
export function writableAccount(address: Address): AccountMeta {
  return { address, role: AccountRole.WRITABLE };
}

/**
 * Append remaining accounts to an instruction produced by the vault SDK.
 *
 * The Voltr adaptor CPIs (deposit/withdraw/initialize strategy, direct
 * withdraw) carry their protocol-specific accounts as trailing remaining
 * accounts after the fixed account list the SDK builds. Everything here is
 * already `@solana/kit`-typed, so this is a plain concatenation — no web3.js
 * interop is needed (klend state is decoded and re-branded at the boundary).
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

/** Little-endian u64 encoding, used for the reward-index prefix in claim args. */
export function encodeU64Le(value: bigint): Uint8Array {
  const buffer = new Uint8Array(8);
  new DataView(buffer.buffer).setBigUint64(0, value, true);
  return buffer;
}

/** Concatenate two byte arrays into a fresh `Uint8Array`. */
export function concatBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

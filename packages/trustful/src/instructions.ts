import {
  AccountRole,
  getU16Encoder,
  getU64Encoder,
  type AccountMeta,
  type Address,
  type Instruction,
  type ReadonlyUint8Array,
  type TransactionSigner,
} from "@solana/kit";
import {
  TRUSTFUL_ADAPTOR_PROGRAM_ID,
  TRUSTFUL_DISCRIMINATOR,
} from "./constants.js";

/**
 * Append adaptor remaining-accounts onto a kit instruction. The vault SDK's
 * `deposit`/`withdraw` strategy instructions forward any trailing accounts to
 * the adaptor CPI; the legacy scripts spliced them in with web3-shaped
 * `appendRemainingAccounts`. This is the kit-native equivalent — signer objects
 * already on `instruction.accounts` are preserved by the spread.
 */
export function withRemainingAccounts(
  instruction: Instruction,
  remaining: AccountMeta<Address>[]
): Instruction {
  return {
    ...instruction,
    accounts: [...(instruction.accounts ?? []), ...remaining],
  };
}

/**
 * Little-endian `u64` bytes. The vault SDK forwards these verbatim as the
 * adaptor's `additional_args` for the arbitrary strategy's `end_value`
 * (position value after deposit/withdraw). Replaces the legacy
 * `new BN(x).toArrayLike(Buffer, "le", 8)`.
 */
export function encodeU64LE(value: bigint): ReadonlyUint8Array {
  return getU64Encoder().encode(value);
}

/**
 * Little-endian `u16` bytes. Used as the curve strategy's `borrow_rate_bps`,
 * both as the vault SDK's `additional_args` and inside the adaptor's own
 * `transfer_curve` instruction. Replaces `new BN(x).toArrayLike(Buffer, "le", 2)`.
 */
export function encodeU16LE(value: number): ReadonlyUint8Array {
  return getU16Encoder().encode(value);
}

export interface TransferCurveInstructionArgs {
  /** Manager — `user` account; signs the transaction (the fee payer). */
  manager: TransactionSigner;
  /** Vault↔strategy authority — the adaptor's `authority` (writable). */
  vaultStrategyAuth: Address;
  /** Curve strategy account (readonly). */
  strategy: Address;
  /** Vault asset mint (writable). */
  vaultAssetMint: Address;
  /** Manager's asset ATA — the adaptor's `user_token_account` (writable). */
  managerAssetAta: Address;
  /** Asset token program (readonly). */
  assetTokenProgram: Address;
  /** Strategy init receipt (readonly). */
  strategyInitReceipt: Address;
  /** Withdrawal-holding authority — the adaptor's `source_authority` (readonly). */
  withdrawalHoldingAuth: Address;
  /** Holding ATA — the adaptor's `source_token_account` (writable). */
  withdrawalHoldingAccount: Address;
  /** Repay amount (`u64`). */
  amount: bigint;
  /** Borrow rate in basis points (`u16`). */
  borrowRateBps: number;
}

/**
 * Build the adaptor's `transfer_curve` instruction directly in `@solana/kit`.
 *
 * The legacy `manager-repay-curve.ts` built this through an Anchor `Program`
 * (pulling in `@coral-xyz/anchor` + `@solana/web3.js`). We encode it by hand
 * instead — discriminator + `u64` amount + `u16` borrow-rate, with the nine
 * accounts in IDL order — so this package stays kit-native and free of legacy
 * deps. See MIGRATION.md for the IDL-handling decision.
 *
 * Account order (from `voltr_trustful_adaptor` IDL `transfer_curve`):
 *   0 user (writable, signer)         5 token_program (readonly)
 *   1 authority (writable)            6 strategy_init_receipt (readonly)
 *   2 strategy (readonly)             7 source_authority (readonly)
 *   3 vault_asset_mint (writable)     8 source_token_account (writable)
 *   4 user_token_account (writable)
 */
export function buildTransferCurveInstruction(
  args: TransferCurveInstructionArgs
): Instruction {
  const data = new Uint8Array(8 + 8 + 2);
  data.set(TRUSTFUL_DISCRIMINATOR.TRANSFER_CURVE, 0);
  data.set(encodeU64LE(args.amount), 8);
  data.set(encodeU16LE(args.borrowRateBps), 16);

  return {
    programAddress: TRUSTFUL_ADAPTOR_PROGRAM_ID,
    accounts: [
      // `user` is marked as a required signer; its signature is supplied by the
      // transaction fee payer (the manager), exactly as the legacy script relied
      // on. The sibling `withdraw_strategy` instruction also carries the manager
      // as a signer, so the signature is collected even with a custom fee payer.
      { address: args.manager.address, role: AccountRole.WRITABLE_SIGNER },
      { address: args.vaultStrategyAuth, role: AccountRole.WRITABLE },
      { address: args.strategy, role: AccountRole.READONLY },
      { address: args.vaultAssetMint, role: AccountRole.WRITABLE },
      { address: args.managerAssetAta, role: AccountRole.WRITABLE },
      { address: args.assetTokenProgram, role: AccountRole.READONLY },
      { address: args.strategyInitReceipt, role: AccountRole.READONLY },
      { address: args.withdrawalHoldingAuth, role: AccountRole.READONLY },
      { address: args.withdrawalHoldingAccount, role: AccountRole.WRITABLE },
    ],
    data,
  };
}

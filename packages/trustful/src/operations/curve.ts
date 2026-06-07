import {
  AccountRole,
  type Address,
  type Instruction,
  type KeyPairSigner,
  type TransactionSigner,
} from "@solana/kit";
import {
  encodeU16Le,
  encodeU64Le,
  setupTokenAccount,
  withRemainingAccounts,
  type BuiltOperation,
  type ScriptContext,
} from "@voltr/scripts-core";
import {
  getCloseStrategyInstructionAsync,
  getDepositStrategyInstructionAsync,
  getInitializeStrategyInstructionAsync,
  getWithdrawStrategyInstructionAsync,
} from "@voltr/vault-sdk";
import {
  TRUSTFUL_ADAPTOR_PROGRAM_ID,
  TRUSTFUL_DISCRIMINATOR,
  TRUSTFUL_SEEDS,
} from "../constants.js";
import {
  deriveAssetAta,
  deriveTrustfulStrategy,
  deriveTrustfulStrategyAccounts,
} from "../pda.js";

// The curve strategy is a per-vault singleton seeded by the constant "curve".
// All four curve operations (init, borrow, repay, remove) derive from this same
// seed, which the adaptor's own `transfer_curve` also hard-codes — keeping the
// vault-SDK and adaptor sides of every curve operation in agreement.

interface TransferCurveInstructionArgs {
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
 * `transfer_curve` is the one curve instruction not exposed by the vault SDK, so
 * it is encoded by hand — discriminator + `u64` amount + `u16` borrow-rate, with
 * the nine accounts in IDL order — keeping this package kit-native (no
 * `@coral-xyz/anchor` / `@solana/web3.js`). See docs/trustful.md for the IDL
 * decision.
 *
 * Account order (from `voltr_trustful_adaptor` IDL `transfer_curve`):
 *   0 user (writable, signer)         5 token_program (readonly)
 *   1 authority (writable)            6 strategy_init_receipt (readonly)
 *   2 strategy (readonly)             7 source_authority (readonly)
 *   3 vault_asset_mint (writable)     8 source_token_account (writable)
 *   4 user_token_account (writable)
 */
function buildTransferCurveInstruction(
  args: TransferCurveInstructionArgs
): Instruction {
  const data = new Uint8Array(8 + 8 + 2);
  data.set(TRUSTFUL_DISCRIMINATOR.TRANSFER_CURVE, 0);
  data.set(encodeU64Le(args.amount), 8);
  data.set(encodeU16Le(args.borrowRateBps), 16);

  return {
    programAddress: TRUSTFUL_ADAPTOR_PROGRAM_ID,
    accounts: [
      // `user` is marked as a required signer; its signature is supplied by the
      // transaction fee payer (the manager). The sibling `withdraw_strategy`
      // instruction also carries the manager as a signer, so the signature is
      // collected even with a custom fee payer.
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

export interface TrustfulCurveInitArgs {
  manager: KeyPairSigner;
  vault: Address;
  assetMint: Address;
  assetTokenProgram: Address;
  lookupTableAddresses?: Address[];
}

/**
 * `trustful:curve:init` — initialize the curve strategy.
 *
 * Creates the withdrawal-holding, vault-strategy, and manager asset ATAs (if
 * missing) and initializes the curve strategy.
 *
 * This builds only the init transaction. Optionally extending a lookup table
 * with the init instruction's accounts is multi-transaction orchestration left
 * to the CLI/processor layer (one builder, one operation), using core's
 * `collectInstructionAddresses` + `buildExtendLookupTableInstructions`; see
 * docs/trustful.md.
 */
export async function buildTrustfulCurveInitOperation(
  ctx: ScriptContext,
  args: TrustfulCurveInitArgs
): Promise<BuiltOperation> {
  const { strategy, vaultStrategyAuth, withdrawalHoldingAuth } =
    await deriveTrustfulStrategyAccounts(args.vault, TRUSTFUL_SEEDS.CURVE);

  const instructions: Instruction[] = [];

  await setupTokenAccount({
    rpc: ctx.rpc,
    payer: args.manager,
    mint: args.assetMint,
    owner: withdrawalHoldingAuth,
    instructions,
    tokenProgram: args.assetTokenProgram,
  });

  await setupTokenAccount({
    rpc: ctx.rpc,
    payer: args.manager,
    mint: args.assetMint,
    owner: vaultStrategyAuth,
    instructions,
    tokenProgram: args.assetTokenProgram,
  });

  await setupTokenAccount({
    rpc: ctx.rpc,
    payer: args.manager,
    mint: args.assetMint,
    owner: args.manager.address,
    instructions,
    tokenProgram: args.assetTokenProgram,
  });

  instructions.push(
    await getInitializeStrategyInstructionAsync({
      payer: args.manager,
      manager: args.manager,
      vault: args.vault,
      strategy,
      adaptorProgram: TRUSTFUL_ADAPTOR_PROGRAM_ID,
      instructionDiscriminator: new Uint8Array(
        TRUSTFUL_DISCRIMINATOR.INITIALIZE_CURVE
      ),
      additionalArgs: null,
    })
  );

  return {
    label: "trustful:curve:init",
    instructions,
    lookupTableAddresses: args.lookupTableAddresses,
  };
}

export interface TrustfulCurveBorrowArgs {
  manager: KeyPairSigner;
  vault: Address;
  assetMint: Address;
  assetTokenProgram: Address;
  /** Amount to borrow from the curve strategy (`u64`). */
  amount: bigint;
  /** Borrow rate in basis points (`u16`, the adaptor's `additional_args`). */
  borrowRateBps: number;
  lookupTableAddresses?: Address[];
}

/**
 * `trustful:curve:borrow` — borrow against the curve strategy.
 *
 * Borrowing draws assets out of the vault, so it goes through the vault SDK's
 * `deposit` strategy instruction with the `BORROW_CURVE` discriminator. The
 * strategy init receipt and the manager's asset ATA are forwarded as remaining
 * accounts; the borrow rate is the adaptor's `additional_args`.
 */
export async function buildTrustfulCurveBorrowOperation(
  ctx: ScriptContext,
  args: TrustfulCurveBorrowArgs
): Promise<BuiltOperation> {
  const { strategy, vaultStrategyAuth, strategyInitReceipt } =
    await deriveTrustfulStrategyAccounts(args.vault, TRUSTFUL_SEEDS.CURVE);

  const instructions: Instruction[] = [];

  await setupTokenAccount({
    rpc: ctx.rpc,
    payer: args.manager,
    mint: args.assetMint,
    owner: vaultStrategyAuth,
    instructions,
    tokenProgram: args.assetTokenProgram,
  });

  const managerAssetAta = await setupTokenAccount({
    rpc: ctx.rpc,
    payer: args.manager,
    mint: args.assetMint,
    owner: args.manager.address,
    instructions,
    tokenProgram: args.assetTokenProgram,
  });

  const depositStrategyIx = await getDepositStrategyInstructionAsync({
    manager: args.manager,
    vault: args.vault,
    strategy,
    vaultAssetMint: args.assetMint,
    assetTokenProgram: args.assetTokenProgram,
    adaptorProgram: TRUSTFUL_ADAPTOR_PROGRAM_ID,
    amount: args.amount,
    instructionDiscriminator: new Uint8Array(
      TRUSTFUL_DISCRIMINATOR.BORROW_CURVE
    ),
    additionalArgs: encodeU16Le(args.borrowRateBps),
  });

  instructions.push(
    withRemainingAccounts(depositStrategyIx, [
      { address: strategyInitReceipt, role: AccountRole.READONLY },
      { address: managerAssetAta, role: AccountRole.WRITABLE },
    ])
  );

  return {
    label: "trustful:curve:borrow",
    instructions,
    lookupTableAddresses: args.lookupTableAddresses,
  };
}

export interface TrustfulCurveRepayArgs {
  manager: KeyPairSigner;
  vault: Address;
  assetMint: Address;
  assetTokenProgram: Address;
  /** Amount to repay to the curve strategy (`u64`). */
  amount: bigint;
  /** Borrow rate in basis points (`u16`). */
  borrowRateBps: number;
  lookupTableAddresses?: Address[];
}

/**
 * `trustful:curve:repay` — repay borrowed assets to the curve strategy.
 *
 * Two instructions: the adaptor's own `transfer_curve` (hand-built in
 * {@link buildTransferCurveInstruction}) followed by the vault SDK `withdraw`
 * strategy instruction with the `REPAY_CURVE` discriminator. The manager's asset
 * ATA is only derived (not created) for the `transfer_curve` `user_token_account`.
 */
export async function buildTrustfulCurveRepayOperation(
  ctx: ScriptContext,
  args: TrustfulCurveRepayArgs
): Promise<BuiltOperation> {
  const { strategy, vaultStrategyAuth, strategyInitReceipt, withdrawalHoldingAuth } =
    await deriveTrustfulStrategyAccounts(args.vault, TRUSTFUL_SEEDS.CURVE);

  const instructions: Instruction[] = [];

  const withdrawalHoldingAccount = await setupTokenAccount({
    rpc: ctx.rpc,
    payer: args.manager,
    mint: args.assetMint,
    owner: withdrawalHoldingAuth,
    instructions,
    tokenProgram: args.assetTokenProgram,
  });

  await setupTokenAccount({
    rpc: ctx.rpc,
    payer: args.manager,
    mint: args.assetMint,
    owner: vaultStrategyAuth,
    instructions,
    tokenProgram: args.assetTokenProgram,
  });

  const managerAssetAta = await deriveAssetAta(
    args.manager.address,
    args.assetMint,
    args.assetTokenProgram
  );

  instructions.push(
    buildTransferCurveInstruction({
      manager: args.manager,
      vaultStrategyAuth,
      strategy,
      vaultAssetMint: args.assetMint,
      managerAssetAta,
      assetTokenProgram: args.assetTokenProgram,
      strategyInitReceipt,
      withdrawalHoldingAuth,
      withdrawalHoldingAccount,
      amount: args.amount,
      borrowRateBps: args.borrowRateBps,
    })
  );

  const withdrawStrategyIx = await getWithdrawStrategyInstructionAsync({
    manager: args.manager,
    vault: args.vault,
    strategy,
    vaultAssetMint: args.assetMint,
    assetTokenProgram: args.assetTokenProgram,
    adaptorProgram: TRUSTFUL_ADAPTOR_PROGRAM_ID,
    amount: args.amount,
    instructionDiscriminator: new Uint8Array(
      TRUSTFUL_DISCRIMINATOR.REPAY_CURVE
    ),
    additionalArgs: encodeU16Le(args.borrowRateBps),
  });

  instructions.push(
    withRemainingAccounts(withdrawStrategyIx, [
      { address: strategyInitReceipt, role: AccountRole.READONLY },
      { address: withdrawalHoldingAuth, role: AccountRole.READONLY },
      { address: withdrawalHoldingAccount, role: AccountRole.WRITABLE },
    ])
  );

  return {
    label: "trustful:curve:repay",
    instructions,
    lookupTableAddresses: args.lookupTableAddresses,
  };
}

export interface TrustfulCurveRemoveArgs {
  manager: KeyPairSigner;
  vault: Address;
  lookupTableAddresses?: Address[];
}

/**
 * `trustful:curve:remove` — close the curve strategy.
 *
 * Closes the curve strategy via the vault SDK `close` strategy instruction.
 */
export async function buildTrustfulCurveRemoveOperation(
  _ctx: ScriptContext,
  args: TrustfulCurveRemoveArgs
): Promise<BuiltOperation> {
  const strategy = await deriveTrustfulStrategy(TRUSTFUL_SEEDS.CURVE);

  const closeStrategyIx = await getCloseStrategyInstructionAsync({
    payer: args.manager,
    manager: args.manager,
    vault: args.vault,
    strategy,
  });

  return {
    label: "trustful:curve:remove",
    instructions: [closeStrategyIx],
    lookupTableAddresses: args.lookupTableAddresses,
  };
}

import { AccountRole, type Address, type Instruction, type KeyPairSigner } from "@solana/kit";
import {
  setupTokenAccount,
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
  buildTransferCurveInstruction,
  encodeU16LE,
  withRemainingAccounts,
} from "../instructions.js";
import {
  deriveAssetAta,
  deriveTrustfulStrategy,
  deriveTrustfulStrategyAccounts,
} from "../pdas.js";

// The curve strategy is a per-vault singleton seeded by the constant "curve".
// All four curve operations derive from this seed. (The legacy
// `manager-repay-curve.ts` derived its strategy from the arbitrary
// `strategySeedString` instead — a latent bug that only lined up when the
// operator happened to set that field to "curve". See MIGRATION.md.)

export interface TrustfulInitializeCurveArgs {
  manager: KeyPairSigner;
  vault: Address;
  assetMint: Address;
  assetTokenProgram: Address;
  lookupTableAddresses?: Address[];
}

/**
 * `trustful:curve:init` — migrated from `manager-initialize-curve.ts`.
 *
 * Creates the withdrawal-holding, vault-strategy, and manager asset ATAs (if
 * missing) and initializes the curve strategy.
 *
 * The legacy script also extended a lookup table with the init instruction's
 * accounts in a *second* transaction. Per the operation-builder contract
 * ("one builder, one operation"), that LUT-maintenance step is left to the
 * CLI/processor layer using core's `collectInstructionAddresses` +
 * `buildExtendLookupTableInstructions`; see MIGRATION.md.
 */
export async function buildTrustfulInitializeCurveOperation(
  ctx: ScriptContext,
  args: TrustfulInitializeCurveArgs
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

export interface TrustfulBorrowCurveArgs {
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
 * `trustful:curve:borrow` — migrated from `manager-borrow-curve.ts`.
 *
 * Borrowing draws assets out of the vault, so it goes through the vault SDK's
 * `deposit` strategy instruction with the `BORROW_CURVE` discriminator. The
 * strategy init receipt and the manager's asset ATA are forwarded as remaining
 * accounts; the borrow rate is the adaptor's `additional_args`.
 */
export async function buildTrustfulBorrowCurveOperation(
  ctx: ScriptContext,
  args: TrustfulBorrowCurveArgs
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
    additionalArgs: encodeU16LE(args.borrowRateBps),
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

export interface TrustfulRepayCurveArgs {
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
 * `trustful:curve:repay` — migrated from `manager-repay-curve.ts`.
 *
 * Two instructions: the adaptor's own `transfer_curve` (hand-built in
 * {@link buildTransferCurveInstruction} rather than via Anchor) followed by the
 * vault SDK `withdraw` strategy instruction with the `REPAY_CURVE`
 * discriminator. The manager's asset ATA is only derived (not created) for the
 * `transfer_curve` `user_token_account`, matching the legacy script.
 */
export async function buildTrustfulRepayCurveOperation(
  ctx: ScriptContext,
  args: TrustfulRepayCurveArgs
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
    additionalArgs: encodeU16LE(args.borrowRateBps),
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

export interface TrustfulRemoveCurveArgs {
  manager: KeyPairSigner;
  vault: Address;
  lookupTableAddresses?: Address[];
}

/**
 * `trustful:curve:remove` — migrated from `manager-remove-curve.ts`.
 *
 * Closes the curve strategy via the vault SDK `close` strategy instruction.
 */
export async function buildTrustfulRemoveCurveOperation(
  _ctx: ScriptContext,
  args: TrustfulRemoveCurveArgs
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

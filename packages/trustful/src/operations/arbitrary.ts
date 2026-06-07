import { AccountRole, type Address, type Instruction, type KeyPairSigner } from "@solana/kit";
import {
  encodeU64Le,
  setupTokenAccount,
  withRemainingAccounts,
  type BuiltOperation,
  type ScriptContext,
} from "@voltr/scripts-core";
import {
  getDepositStrategyInstructionAsync,
  getInitializeStrategyInstructionAsync,
  getWithdrawStrategyInstructionAsync,
} from "@voltr/vault-sdk";
import {
  TRUSTFUL_ADAPTOR_PROGRAM_ID,
  TRUSTFUL_DISCRIMINATOR,
} from "../constants.js";
import { deriveTrustfulStrategyAccounts } from "../pda.js";

export interface TrustfulArbitraryInitArgs {
  manager: KeyPairSigner;
  vault: Address;
  assetMint: Address;
  assetTokenProgram: Address;
  /** Operator-chosen seed identifying the arbitrary strategy. */
  strategySeedString: string;
  lookupTableAddresses?: Address[];
}

/**
 * `trustful:arbitrary:init` — initialize the arbitrary strategy.
 *
 * Creates the vault-strategy authority's asset ATA (if missing) and initializes
 * the arbitrary strategy via the vault SDK with the adaptor's
 * `INITIALIZE_ARBITRARY` discriminator.
 */
export async function buildTrustfulArbitraryInitOperation(
  ctx: ScriptContext,
  args: TrustfulArbitraryInitArgs
): Promise<BuiltOperation> {
  const { strategy, vaultStrategyAuth } = await deriveTrustfulStrategyAccounts(
    args.vault,
    args.strategySeedString
  );

  const instructions: Instruction[] = [];

  await setupTokenAccount({
    rpc: ctx.rpc,
    payer: args.manager,
    mint: args.assetMint,
    owner: vaultStrategyAuth,
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
        TRUSTFUL_DISCRIMINATOR.INITIALIZE_ARBITRARY
      ),
      additionalArgs: null,
    })
  );

  return {
    label: "trustful:arbitrary:init",
    instructions,
    lookupTableAddresses: args.lookupTableAddresses,
  };
}

export interface TrustfulArbitraryDepositArgs {
  manager: KeyPairSigner;
  vault: Address;
  assetMint: Address;
  assetTokenProgram: Address;
  strategySeedString: string;
  /** Account that receives the deposited assets (adaptor remaining account). */
  destinationAssetTokenAccount: Address;
  amount: bigint;
  /** Reported strategy position value after the deposit (`u64`). */
  positionValueAfterDeposit: bigint;
  lookupTableAddresses?: Address[];
}

/**
 * `trustful:arbitrary:deposit` — deposit vault assets into the arbitrary strategy.
 *
 * Ensures the withdrawal-holding ATA and the vault-strategy ATA exist, then
 * deposits into the arbitrary strategy, forwarding `destinationAssetTokenAccount`
 * as a remaining account and the position value as the adaptor's `additional_args`.
 *
 * The withdrawal-holding account is returned as {@link BuiltOperation.metadata}
 * so the manager knows where to return strategy assets before withdrawing.
 */
export async function buildTrustfulArbitraryDepositOperation(
  ctx: ScriptContext,
  args: TrustfulArbitraryDepositArgs
): Promise<BuiltOperation> {
  const { strategy, vaultStrategyAuth, withdrawalHoldingAuth } =
    await deriveTrustfulStrategyAccounts(args.vault, args.strategySeedString);

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

  const depositStrategyIx = await getDepositStrategyInstructionAsync({
    manager: args.manager,
    vault: args.vault,
    strategy,
    vaultAssetMint: args.assetMint,
    assetTokenProgram: args.assetTokenProgram,
    adaptorProgram: TRUSTFUL_ADAPTOR_PROGRAM_ID,
    amount: args.amount,
    instructionDiscriminator: new Uint8Array(
      TRUSTFUL_DISCRIMINATOR.DEPOSIT_ARBITRARY
    ),
    additionalArgs: encodeU64Le(args.positionValueAfterDeposit),
  });

  instructions.push(
    withRemainingAccounts(depositStrategyIx, [
      { address: args.destinationAssetTokenAccount, role: AccountRole.WRITABLE },
    ])
  );

  return {
    label: "trustful:arbitrary:deposit",
    instructions,
    lookupTableAddresses: args.lookupTableAddresses,
    metadata: { withdrawalHoldingAccount },
  };
}

export interface TrustfulArbitraryWithdrawArgs {
  manager: KeyPairSigner;
  vault: Address;
  assetMint: Address;
  assetTokenProgram: Address;
  strategySeedString: string;
  amount: bigint;
  /** Reported strategy position value after the withdrawal (`u64`). */
  positionValueAfterWithdraw: bigint;
  lookupTableAddresses?: Address[];
}

/**
 * `trustful:arbitrary:withdraw` — withdraw vault assets from the arbitrary strategy.
 *
 * Ensures the withdrawal-holding ATA and vault-strategy ATA exist, then
 * withdraws from the arbitrary strategy. The withdrawal-holding authority and
 * its ATA are forwarded as remaining accounts; the post-withdraw position value
 * is the adaptor's `additional_args`.
 */
export async function buildTrustfulArbitraryWithdrawOperation(
  ctx: ScriptContext,
  args: TrustfulArbitraryWithdrawArgs
): Promise<BuiltOperation> {
  const { strategy, vaultStrategyAuth, withdrawalHoldingAuth } =
    await deriveTrustfulStrategyAccounts(args.vault, args.strategySeedString);

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

  const withdrawStrategyIx = await getWithdrawStrategyInstructionAsync({
    manager: args.manager,
    vault: args.vault,
    strategy,
    vaultAssetMint: args.assetMint,
    assetTokenProgram: args.assetTokenProgram,
    adaptorProgram: TRUSTFUL_ADAPTOR_PROGRAM_ID,
    amount: args.amount,
    instructionDiscriminator: new Uint8Array(
      TRUSTFUL_DISCRIMINATOR.WITHDRAW_ARBITRARY
    ),
    additionalArgs: encodeU64Le(args.positionValueAfterWithdraw),
  });

  instructions.push(
    withRemainingAccounts(withdrawStrategyIx, [
      { address: withdrawalHoldingAuth, role: AccountRole.READONLY },
      { address: withdrawalHoldingAccount, role: AccountRole.WRITABLE },
    ])
  );

  return {
    label: "trustful:arbitrary:withdraw",
    instructions,
    lookupTableAddresses: args.lookupTableAddresses,
  };
}

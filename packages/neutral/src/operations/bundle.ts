import {
  address,
  type AccountMeta,
  type Instruction,
  type TransactionSigner,
  type Address,
} from "@solana/kit";
import {
  getInitializeStrategyInstructionAsync,
  getDepositStrategyInstructionAsync,
  getWithdrawStrategyInstructionAsync,
} from "@voltr/vault-sdk";
import {
  readonlyAccount,
  writableAccount,
  withRemainingAccounts,
  setupTokenAccount,
  type BuiltOperation,
  type ScriptContext,
} from "@voltr/scripts-core";
import {
  NEUTRAL_ADAPTOR_PROGRAM_ID,
  NTBUNDLE_PROGRAM_ID,
  NEUTRAL_DISCRIMINATOR,
  U64_MAX,
  assertNeutralAmount,
} from "../constants.js";
import {
  loadNeutralBundlePosition,
  assertNeutralAccountingVersion,
  type NeutralBundleAddressArgs,
} from "../bundle.js";
import { getInitializePermissionedBundleDepositorInstructionAsync } from "../generated/instructions/initializePermissionedBundleDepositor.js";

const SYSTEM_PROGRAM = address("11111111111111111111111111111111");
const RENT = address("SysvarRent111111111111111111111111111111111");

export interface NeutralBundleInitArgs extends NeutralBundleAddressArgs {
  manager: TransactionSigner;
  lookupTableAddresses?: Array<Address>;
}
export interface NeutralBundleDepositArgs extends NeutralBundleInitArgs {
  amount: bigint;
}
export type NeutralBundleRequestWithdrawArgs = NeutralBundleDepositArgs;
export type NeutralBundleRefreshArgs = NeutralBundleInitArgs;
export type NeutralBundleClaimArgs = NeutralBundleInitArgs;
export interface NeutralBundleRegisterDepositorArgs
  extends NeutralBundleAddressArgs {
  bundleManager: TransactionSigner;
  lookupTableAddresses?: NeutralBundleInitArgs["lookupTableAddresses"];
}

export async function buildNeutralBundleRegisterDepositorOperation(
  context: ScriptContext,
  args: NeutralBundleRegisterDepositorArgs
): Promise<BuiltOperation> {
  const { bundle, accounts } = await loadNeutralBundlePosition(context, args);
  if (!bundle.permissionned)
    throw new Error("Bundle is not permissioned; use neutral:bundle:init");
  if (args.bundleManager.address !== bundle.manager)
    throw new Error(
      "Registration must be signed by the Neutral bundle manager"
    );
  const instruction =
    await getInitializePermissionedBundleDepositorInstructionAsync({
      payer: args.bundleManager,
      authority: accounts.vaultStrategyAuth,
      bundleAccount: args.bundle,
      userBundleAccount: accounts.userBundleAccount,
    });
  return {
    label: "neutral:bundle:register-depositor",
    instructions: [instruction],
    lookupTableAddresses: args.lookupTableAddresses,
  };
}

export async function buildNeutralBundleInitOperation(
  context: ScriptContext,
  args: NeutralBundleInitArgs
): Promise<BuiltOperation> {
  const { bundle, accounts, user, receipt } = await loadNeutralBundlePosition(
    context,
    args
  );
  assertNeutralAccountingVersion(receipt);
  if (bundle.permissionned && !user)
    throw new Error(
      "Permissioned bundle: its Neutral manager must run neutral:bundle:register-depositor first"
    );
  const instructions: Array<Instruction> = [];
  await setupTokenAccount({
    payer: args.manager,
    mint: args.assetMint,
    owner: accounts.vaultStrategyAuth,
    tokenProgram: args.assetTokenProgram,
    instructions,
  });
  const instruction = await getInitializeStrategyInstructionAsync({
    payer: args.manager,
    manager: args.manager,
    vault: args.vault,
    strategy: args.bundle,
    adaptorProgram: NEUTRAL_ADAPTOR_PROGRAM_ID,
    instructionDiscriminator: null,
    additionalArgs: null,
  });
  instructions.push(
    withRemainingAccounts(instruction, [
      writableAccount(args.bundle),
      writableAccount(accounts.userBundleAccount),
      readonlyAccount(NTBUNDLE_PROGRAM_ID),
    ])
  );
  return {
    label: "neutral:bundle:init",
    instructions,
    lookupTableAddresses: args.lookupTableAddresses,
  };
}

async function buildPositionOperation(
  context: ScriptContext,
  args: NeutralBundleInitArgs,
  action: "deposit" | "refresh" | "request-withdraw" | "claim",
  amount: bigint
): Promise<BuiltOperation> {
  const { bundle, accounts, user, receipt, strategyAtaAmount } =
    await loadNeutralBundlePosition(context, args);
  if (!user || !receipt)
    throw new Error("Initialize the Neutral strategy before operating it");
  assertNeutralAccountingVersion(receipt);
  if (
    action === "request-withdraw" &&
    (user.pendingDeposit > 0n || user.pendingShares > 0n || user.switchActive)
  )
    throw new Error(
      "Neutral has a pending deposit, withdrawal or switch; wait for keeper processing"
    );
  if (action === "request-withdraw" && user.shares === 0n)
    throw new Error("No Neutral shares to redeem");
  if (action === "claim" && strategyAtaAmount === 0n)
    throw new Error(
      "No tokens are available in the strategy ATA; keeper settlement is required before claim"
    );
  let remaining: Array<AccountMeta>;
  if (action === "claim") {
    remaining = [
      readonlyAccount(args.bundle),
      readonlyAccount(accounts.userBundleAccount),
      readonlyAccount(accounts.oracleData),
    ];
  } else {
    remaining = [
      writableAccount(args.bundle),
      writableAccount(accounts.userBundleAccount),
      writableAccount(accounts.oracleData),
      writableAccount(accounts.bundleTempData),
    ];
    if (action === "request-withdraw")
      remaining.push(
        readonlyAccount(NTBUNDLE_PROGRAM_ID),
        readonlyAccount(SYSTEM_PROGRAM),
        readonlyAccount(RENT)
      );
    else
      remaining.push(
        writableAccount(accounts.pendingDepositTokenAccount),
        writableAccount(accounts.pendingBundleAssetAuthority),
        writableAccount(bundle.treasuryAccount),
        readonlyAccount(NTBUNDLE_PROGRAM_ID),
        readonlyAccount(SYSTEM_PROGRAM)
      );
  }
  const input = {
    manager: args.manager,
    vault: args.vault,
    strategy: args.bundle,
    vaultAssetMint: args.assetMint,
    assetTokenProgram: args.assetTokenProgram,
    adaptorProgram: NEUTRAL_ADAPTOR_PROGRAM_ID,
    amount,
    additionalArgs: null,
    instructionDiscriminator:
      action === "request-withdraw"
        ? new Uint8Array(NEUTRAL_DISCRIMINATOR.REQUEST_WITHDRAW)
        : null,
  };
  const instruction =
    action === "deposit" || action === "refresh"
      ? await getDepositStrategyInstructionAsync(input)
      : await getWithdrawStrategyInstructionAsync(input);
  return {
    label: `neutral:bundle:${action}`,
    instructions: [withRemainingAccounts(instruction, remaining)],
    lookupTableAddresses: args.lookupTableAddresses,
  };
}

export async function buildNeutralBundleDepositOperation(
  context: ScriptContext,
  args: NeutralBundleDepositArgs
): Promise<BuiltOperation> {
  assertNeutralAmount(args.amount);
  return buildPositionOperation(context, args, "deposit", args.amount);
}
export async function buildNeutralBundleRefreshOperation(
  context: ScriptContext,
  args: NeutralBundleRefreshArgs
): Promise<BuiltOperation> {
  return buildPositionOperation(context, args, "refresh", 0n);
}
export async function buildNeutralBundleRequestWithdrawOperation(
  context: ScriptContext,
  args: NeutralBundleRequestWithdrawArgs
): Promise<BuiltOperation> {
  assertNeutralAmount(args.amount);
  return buildPositionOperation(context, args, "request-withdraw", args.amount);
}
export async function buildNeutralBundleClaimOperation(
  context: ScriptContext,
  args: NeutralBundleClaimArgs
): Promise<BuiltOperation> {
  return buildPositionOperation(context, args, "claim", U64_MAX);
}

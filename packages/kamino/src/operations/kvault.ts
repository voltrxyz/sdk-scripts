import type { AccountMeta, Address, Instruction, KeyPairSigner } from "@solana/kit";
import {
  findAssociatedTokenPda,
  getCreateAssociatedTokenIdempotentInstructionAsync,
  TOKEN_PROGRAM_ADDRESS,
} from "@solana-program/token";
import {
  findRequestWithdrawVaultReceiptPda,
  findVaultLpMintPda,
  findVaultStrategyAuthPda,
  getDepositStrategyInstructionAsync,
  getDirectWithdrawStrategyInstructionAsync,
  getInitializeStrategyInstructionAsync,
  getRequestWithdrawVaultInstructionAsync,
  getWithdrawStrategyInstructionAsync,
} from "@voltr/vault-sdk";
import {
  readonlyAccount,
  setupTokenAccount,
  withRemainingAccounts,
  writableAccount,
  type BuiltOperation,
  type ScriptContext,
} from "@voltr/scripts-core";
import {
  FARM_GLOBAL_CONFIG,
  FARMS_PROGRAM_ID,
  KAMINO_ADAPTOR_PROGRAM_ID,
  KAMINO_DISCRIMINATOR,
  KLEND_PROGRAM_ID,
  SCOPE,
} from "../constants.js";
import {
  buildKvaultDepositAccounts,
  buildKvaultWithdrawAccounts,
  loadKvaultReserves,
} from "../kvault.js";
import {
  findFarmRewardsTreasuryVaultPda,
  findFarmRewardsVaultPda,
  findFarmVaultsAuthorityPda,
  findKvaultSharesMintPda,
} from "../pda.js";
import { buildClaimAdditionalArgs, type KaminoJupiterSwap } from "../swap.js";

export interface KaminoKvaultInitArgs {
  /** Manager keypair; also pays for ATA creation and the strategy receipt. */
  manager: KeyPairSigner;
  vault: Address;
  assetMint: Address;
  assetTokenProgram: Address;
  /** Kamino vault (kvault) address; used as the Voltr strategy id. */
  kvault: Address;
  lookupTableAddresses?: Address[];
}

/**
 * `kamino:kvault:init` — initialize a Voltr strategy backed by a Kamino vault.
 * Migrated from `manager-initialize-kvault.ts`.
 */
export async function buildKaminoKvaultInitOperation(
  ctx: ScriptContext,
  args: KaminoKvaultInitArgs
): Promise<BuiltOperation> {
  const strategy = args.kvault;
  const [vaultStrategyAuth] = await findVaultStrategyAuthPda({
    vault: args.vault,
    strategy,
  });

  const instructions: Instruction[] = [];
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

  const sharesMint = await findKvaultSharesMintPda(args.kvault);
  await setupTokenAccount({
    rpc: ctx.rpc,
    payer: args.manager,
    mint: sharesMint,
    owner: vaultStrategyAuth,
    instructions,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  });

  const initIx = await getInitializeStrategyInstructionAsync({
    payer: args.manager,
    manager: args.manager,
    vault: args.vault,
    strategy,
    adaptorProgram: KAMINO_ADAPTOR_PROGRAM_ID,
    instructionDiscriminator: new Uint8Array(
      KAMINO_DISCRIMINATOR.INITIALIZE_VAULT
    ),
    additionalArgs: null,
  });
  instructions.push(initIx);

  return {
    label: "kamino:kvault:init",
    instructions,
    lookupTableAddresses: args.lookupTableAddresses,
  };
}

export interface KaminoKvaultDepositArgs {
  manager: KeyPairSigner;
  vault: Address;
  assetMint: Address;
  assetTokenProgram: Address;
  /** Kamino vault (kvault) address; used as the Voltr strategy id. */
  kvault: Address;
  /** Raw asset amount in smallest units. */
  amount: bigint;
  lookupTableAddresses?: Address[];
}

/**
 * `kamino:kvault:deposit` — deposit vault assets into a Kamino vault via the
 * Voltr Kamino adaptor. Migrated from `manager-deposit-kvault.ts`.
 */
export async function buildKaminoKvaultDepositOperation(
  ctx: ScriptContext,
  args: KaminoKvaultDepositArgs
): Promise<BuiltOperation> {
  const strategy = args.kvault;
  const [vaultStrategyAuth] = await findVaultStrategyAuthPda({
    vault: args.vault,
    strategy,
  });

  const instructions: Instruction[] = [];
  await setupTokenAccount({
    rpc: ctx.rpc,
    payer: args.manager,
    mint: args.assetMint,
    owner: vaultStrategyAuth,
    instructions,
    tokenProgram: args.assetTokenProgram,
  });

  const { sharesMint, remaining, vaultLookupTable } =
    await buildKvaultDepositAccounts(ctx.rpc, {
      kvault: args.kvault,
      vaultStrategyAuth,
    });

  await setupTokenAccount({
    rpc: ctx.rpc,
    payer: args.manager,
    mint: sharesMint,
    owner: vaultStrategyAuth,
    instructions,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  });

  const depositIx = await getDepositStrategyInstructionAsync({
    manager: args.manager,
    vault: args.vault,
    strategy,
    vaultAssetMint: args.assetMint,
    assetTokenProgram: args.assetTokenProgram,
    adaptorProgram: KAMINO_ADAPTOR_PROGRAM_ID,
    amount: args.amount,
    instructionDiscriminator: new Uint8Array(
      KAMINO_DISCRIMINATOR.DEPOSIT_VAULT
    ),
    additionalArgs: null,
  });
  instructions.push(withRemainingAccounts(depositIx, remaining));

  return {
    label: "kamino:kvault:deposit",
    instructions,
    lookupTableAddresses: [
      ...(args.lookupTableAddresses ?? []),
      vaultLookupTable,
    ],
  };
}

export interface KaminoKvaultWithdrawArgs {
  manager: KeyPairSigner;
  vault: Address;
  assetMint: Address;
  assetTokenProgram: Address;
  /** Kamino vault (kvault) address; used as the Voltr strategy id. */
  kvault: Address;
  /** Raw asset amount in smallest units (pass a large value to withdraw all). */
  amount: bigint;
  lookupTableAddresses?: Address[];
}

/**
 * `kamino:kvault:withdraw` — withdraw vault assets from a Kamino vault via the
 * Voltr Kamino adaptor. Migrated from `manager-withdraw-kvault.ts`.
 */
export async function buildKaminoKvaultWithdrawOperation(
  ctx: ScriptContext,
  args: KaminoKvaultWithdrawArgs
): Promise<BuiltOperation> {
  const strategy = args.kvault;
  const [vaultStrategyAuth] = await findVaultStrategyAuthPda({
    vault: args.vault,
    strategy,
  });

  const instructions: Instruction[] = [];
  await setupTokenAccount({
    rpc: ctx.rpc,
    payer: args.manager,
    mint: args.assetMint,
    owner: vaultStrategyAuth,
    instructions,
    tokenProgram: args.assetTokenProgram,
  });

  const { sharesMint, remaining, vaultLookupTable } =
    await buildKvaultWithdrawAccounts(ctx.rpc, {
      kvault: args.kvault,
      assetMint: args.assetMint,
      vaultStrategyAuth,
    });

  await setupTokenAccount({
    rpc: ctx.rpc,
    payer: args.manager,
    mint: sharesMint,
    owner: vaultStrategyAuth,
    instructions,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  });

  const withdrawIx = await getWithdrawStrategyInstructionAsync({
    manager: args.manager,
    vault: args.vault,
    strategy,
    vaultAssetMint: args.assetMint,
    assetTokenProgram: args.assetTokenProgram,
    adaptorProgram: KAMINO_ADAPTOR_PROGRAM_ID,
    amount: args.amount,
    instructionDiscriminator: new Uint8Array(
      KAMINO_DISCRIMINATOR.WITHDRAW_VAULT
    ),
    additionalArgs: null,
  });
  instructions.push(withRemainingAccounts(withdrawIx, remaining));

  return {
    label: "kamino:kvault:withdraw",
    instructions,
    lookupTableAddresses: [
      ...(args.lookupTableAddresses ?? []),
      vaultLookupTable,
    ],
  };
}

export interface KaminoKvaultClaimRewardArgs {
  manager: KeyPairSigner;
  vault: Address;
  assetMint: Address;
  assetTokenProgram: Address;
  /** Kamino vault (kvault) address; used as the Voltr strategy id. */
  kvault: Address;
  /** Reward mint being claimed from the kvault's farm. */
  rewardMint: Address;
  /** Token program owning the reward mint. */
  rewardTokenProgram: Address;
  /** Farm state holding the reward (resolved off-chain via the farms SDK). */
  farmState: Address;
  /** User (vault strategy) farm state for the farm. */
  userState: Address;
  /**
   * Reward index when claiming a specific reward slot. Omit to claim the first
   * reward (the non-indexed variant).
   */
  rewardIndex?: number;
  /** Pre-resolved Jupiter swap (reward -> asset). Omit when reward == asset. */
  jupiterSwap?: KaminoJupiterSwap;
  lookupTableAddresses?: Address[];
}

/**
 * `kamino:kvault:claim-reward` — claim a Kamino vault farm reward into the
 * vault asset for one farm. Migrated from `manager-claim-kvault-rewards.ts` and
 * `manager-claim-kvault-rewards-with-index.ts` (via the optional `rewardIndex`).
 *
 * This operates on a single, already-resolved farm/reward. Discovering the
 * claimable farms (farms SDK) and building the Jupiter route are CLI-layer
 * concerns; see the migration docs.
 */
export async function buildKaminoKvaultClaimRewardOperation(
  ctx: ScriptContext,
  args: KaminoKvaultClaimRewardArgs
): Promise<BuiltOperation> {
  const strategy = args.kvault;
  const [vaultStrategyAuth] = await findVaultStrategyAuthPda({
    vault: args.vault,
    strategy,
  });

  const sharesMint = await findKvaultSharesMintPda(args.kvault);
  const [userSharesAta] = await findAssociatedTokenPda({
    owner: vaultStrategyAuth,
    mint: sharesMint,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  });
  const [userRewardAta] = await findAssociatedTokenPda({
    owner: vaultStrategyAuth,
    mint: args.rewardMint,
    tokenProgram: args.rewardTokenProgram,
  });
  const rewardsVault = await findFarmRewardsVaultPda(
    args.farmState,
    args.rewardMint
  );
  const farmVaultsAuthority = await findFarmVaultsAuthorityPda(args.farmState);
  const rewardsTreasuryVault = await findFarmRewardsTreasuryVaultPda(
    FARM_GLOBAL_CONFIG,
    args.rewardMint
  );

  const { reserveAccountMetas, lendingMarketAccountMetas, vaultLookupTable } =
    await loadKvaultReserves(ctx.rpc, args.kvault);

  const instructions: Instruction[] = [];
  instructions.push(
    await getCreateAssociatedTokenIdempotentInstructionAsync({
      payer: args.manager,
      owner: vaultStrategyAuth,
      mint: args.rewardMint,
      tokenProgram: args.rewardTokenProgram,
    })
  );

  const claimRemaining: AccountMeta[] = [
    writableAccount(args.kvault),
    writableAccount(userSharesAta),
    writableAccount(args.userState),
    writableAccount(args.farmState),
    readonlyAccount(FARM_GLOBAL_CONFIG),
    readonlyAccount(args.rewardMint),
    writableAccount(userRewardAta),
    writableAccount(rewardsVault),
    writableAccount(rewardsTreasuryVault),
    readonlyAccount(farmVaultsAuthority),
    readonlyAccount(SCOPE),
    readonlyAccount(args.rewardTokenProgram),
    readonlyAccount(FARMS_PROGRAM_ID),
    readonlyAccount(KLEND_PROGRAM_ID),
  ];

  const discriminator =
    args.rewardIndex === undefined
      ? KAMINO_DISCRIMINATOR.CLAIM_VAULT_REWARDS
      : KAMINO_DISCRIMINATOR.CLAIM_VAULT_REWARDS_WITH_INDEX;

  const withdrawIx = await getWithdrawStrategyInstructionAsync({
    manager: args.manager,
    vault: args.vault,
    strategy,
    vaultAssetMint: args.assetMint,
    assetTokenProgram: args.assetTokenProgram,
    adaptorProgram: KAMINO_ADAPTOR_PROGRAM_ID,
    amount: 0n,
    instructionDiscriminator: new Uint8Array(discriminator),
    additionalArgs: buildClaimAdditionalArgs(args.rewardIndex, args.jupiterSwap),
  });
  instructions.push(
    withRemainingAccounts(withdrawIx, [
      ...claimRemaining,
      ...reserveAccountMetas,
      ...lendingMarketAccountMetas,
      ...(args.jupiterSwap?.swapAccounts ?? []),
    ])
  );

  return {
    // The base and `-with-index` CLI variants build different adaptor
    // discriminators, so the label reflects which one ran (command == label).
    label:
      args.rewardIndex === undefined
        ? "kamino:kvault:claim-reward"
        : "kamino:kvault:claim-reward-with-index",
    instructions,
    lookupTableAddresses: [
      ...(args.lookupTableAddresses ?? []),
      vaultLookupTable,
      ...(args.jupiterSwap?.lookupTableAddresses ?? []),
    ],
  };
}

export interface KaminoKvaultDirectWithdrawArgs {
  /** User keypair; the withdraw transfer authority. */
  user: KeyPairSigner;
  vault: Address;
  assetMint: Address;
  assetTokenProgram: Address;
  /** Kamino vault (kvault) address; used as the Voltr strategy id. */
  kvault: Address;
  lookupTableAddresses?: Address[];
}

/**
 * `kamino:kvault:direct-withdraw` — a user directly withdraws their share of a
 * Kamino vault (kvault) strategy. Migrated from `user-direct-withdraw-strategy.ts`.
 */
export async function buildKaminoKvaultDirectWithdrawOperation(
  ctx: ScriptContext,
  args: KaminoKvaultDirectWithdrawArgs
): Promise<BuiltOperation> {
  const strategy = args.kvault;
  const [vaultStrategyAuth] = await findVaultStrategyAuthPda({
    vault: args.vault,
    strategy,
  });

  const instructions: Instruction[] = [];
  await setupTokenAccount({
    rpc: ctx.rpc,
    payer: args.user,
    mint: args.assetMint,
    owner: vaultStrategyAuth,
    instructions,
    tokenProgram: args.assetTokenProgram,
  });
  await setupTokenAccount({
    rpc: ctx.rpc,
    payer: args.user,
    mint: args.assetMint,
    owner: args.user.address,
    instructions,
    tokenProgram: args.assetTokenProgram,
  });

  const { sharesMint, remaining, vaultLookupTable } =
    await buildKvaultWithdrawAccounts(ctx.rpc, {
      kvault: args.kvault,
      assetMint: args.assetMint,
      vaultStrategyAuth,
    });

  await setupTokenAccount({
    rpc: ctx.rpc,
    payer: args.user,
    mint: sharesMint,
    owner: vaultStrategyAuth,
    instructions,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  });

  const directWithdrawIx = await getDirectWithdrawStrategyInstructionAsync({
    userTransferAuthority: args.user,
    vault: args.vault,
    strategy,
    vaultAssetMint: args.assetMint,
    adaptorProgram: KAMINO_ADAPTOR_PROGRAM_ID,
    assetTokenProgram: args.assetTokenProgram,
    userArgs: null,
  });
  instructions.push(withRemainingAccounts(directWithdrawIx, remaining));

  return {
    label: "kamino:kvault:direct-withdraw",
    instructions,
    lookupTableAddresses: [
      ...(args.lookupTableAddresses ?? []),
      vaultLookupTable,
    ],
  };
}

export interface KaminoKvaultRequestAndDirectWithdrawArgs {
  /** User keypair; payer and withdraw transfer authority. */
  user: KeyPairSigner;
  vault: Address;
  assetMint: Address;
  assetTokenProgram: Address;
  /** Kamino vault (kvault) address; used as the Voltr strategy id. */
  kvault: Address;
  /** Amount to request to withdraw (raw units; LP or asset per `isAmountInLp`). */
  withdrawAmount: bigint;
  isAmountInLp: boolean;
  isWithdrawAll: boolean;
  lookupTableAddresses?: Address[];
}

/**
 * `kamino:kvault:request-and-direct-withdraw` — request a vault withdrawal and
 * directly withdraw from the Kamino vault (kvault) strategy in one transaction.
 * Migrated from `user-request-and-direct-withdraw-strategy.ts`.
 */
export async function buildKaminoKvaultRequestAndDirectWithdrawOperation(
  ctx: ScriptContext,
  args: KaminoKvaultRequestAndDirectWithdrawArgs
): Promise<BuiltOperation> {
  const instructions: Instruction[] = [];

  // 1. Request withdraw: ensure the receipt's LP token account exists, then
  //    record the withdrawal request.
  const [vaultLpMint] = await findVaultLpMintPda({ vault: args.vault });
  const [requestWithdrawVaultReceipt] =
    await findRequestWithdrawVaultReceiptPda({
      vault: args.vault,
      userTransferAuthority: args.user.address,
    });
  await setupTokenAccount({
    rpc: ctx.rpc,
    payer: args.user,
    mint: vaultLpMint,
    owner: requestWithdrawVaultReceipt,
    instructions,
  });
  instructions.push(
    await getRequestWithdrawVaultInstructionAsync({
      payer: args.user,
      userTransferAuthority: args.user,
      vault: args.vault,
      amount: args.withdrawAmount,
      isAmountInLp: args.isAmountInLp,
      isWithdrawAll: args.isWithdrawAll,
    })
  );

  // 2. Direct withdraw from the Kamino vault strategy.
  const strategy = args.kvault;
  const [vaultStrategyAuth] = await findVaultStrategyAuthPda({
    vault: args.vault,
    strategy,
  });
  await setupTokenAccount({
    rpc: ctx.rpc,
    payer: args.user,
    mint: args.assetMint,
    owner: vaultStrategyAuth,
    instructions,
    tokenProgram: args.assetTokenProgram,
  });
  await setupTokenAccount({
    rpc: ctx.rpc,
    payer: args.user,
    mint: args.assetMint,
    owner: args.user.address,
    instructions,
    tokenProgram: args.assetTokenProgram,
  });

  const { sharesMint, remaining, vaultLookupTable } =
    await buildKvaultWithdrawAccounts(ctx.rpc, {
      kvault: args.kvault,
      assetMint: args.assetMint,
      vaultStrategyAuth,
    });

  await setupTokenAccount({
    rpc: ctx.rpc,
    payer: args.user,
    mint: sharesMint,
    owner: vaultStrategyAuth,
    instructions,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  });

  const directWithdrawIx = await getDirectWithdrawStrategyInstructionAsync({
    userTransferAuthority: args.user,
    vault: args.vault,
    strategy,
    vaultAssetMint: args.assetMint,
    adaptorProgram: KAMINO_ADAPTOR_PROGRAM_ID,
    assetTokenProgram: args.assetTokenProgram,
    userArgs: null,
  });
  instructions.push(withRemainingAccounts(directWithdrawIx, remaining));

  return {
    label: "kamino:kvault:request-and-direct-withdraw",
    instructions,
    lookupTableAddresses: [
      ...(args.lookupTableAddresses ?? []),
      vaultLookupTable,
    ],
  };
}

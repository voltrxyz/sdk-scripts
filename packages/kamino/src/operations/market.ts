import type { AccountMeta, Address, Instruction, KeyPairSigner } from "@solana/kit";
import {
  findAssociatedTokenPda,
  getCreateAssociatedTokenIdempotentInstructionAsync,
  TOKEN_PROGRAM_ADDRESS,
} from "@solana-program/token";
import {
  findVaultStrategyAuthPda,
  getDepositStrategyInstructionAsync,
  getInitializeStrategyInstructionAsync,
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
  SYSTEM_PROGRAM_ID,
  SYSVAR_INSTRUCTIONS_ADDRESS,
  SYSVAR_RENT_ADDRESS,
} from "../constants.js";
import {
  findFarmRewardsTreasuryVaultPda,
  findFarmRewardsVaultPda,
  findFarmVaultsAuthorityPda,
} from "../pda.js";
import { loadMarketReserveAccounts } from "../reserve.js";
import { buildClaimAdditionalArgs, type KaminoJupiterSwap } from "../swap.js";

export interface KaminoMarketInitArgs {
  /** Manager keypair; also pays for ATA creation and the strategy receipt. */
  manager: KeyPairSigner;
  vault: Address;
  assetMint: Address;
  assetTokenProgram: Address;
  /** klend reserve the strategy lends into; used as the Voltr strategy id. */
  reserve: Address;
  lookupTableAddresses?: Address[];
}

/**
 * `kamino:market:init` — initialize a Voltr strategy backed by a klend reserve.
 * The manager signs and pays; the reserve address is the strategy id.
 */
export async function buildKaminoMarketInitOperation(
  ctx: ScriptContext,
  args: KaminoMarketInitArgs
): Promise<BuiltOperation> {
  const strategy = args.reserve;
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

  const reserve = await loadMarketReserveAccounts(ctx.rpc, {
    reserve: args.reserve,
    vaultStrategyAuth,
  });

  const remaining: AccountMeta[] = [
    writableAccount(reserve.userMetadata),
    writableAccount(reserve.obligation),
    readonlyAccount(reserve.lendingMarketAuthority),
    writableAccount(args.reserve),
    writableAccount(reserve.reserveFarmState),
    writableAccount(reserve.obligationFarm),
    readonlyAccount(reserve.lendingMarket),
    readonlyAccount(FARMS_PROGRAM_ID),
    readonlyAccount(SYSVAR_RENT_ADDRESS),
    readonlyAccount(KLEND_PROGRAM_ID),
  ];

  const initIx = await getInitializeStrategyInstructionAsync({
    payer: args.manager,
    manager: args.manager,
    vault: args.vault,
    strategy,
    adaptorProgram: KAMINO_ADAPTOR_PROGRAM_ID,
    instructionDiscriminator: new Uint8Array(
      KAMINO_DISCRIMINATOR.INITIALIZE_MARKET
    ),
    additionalArgs: null,
  });
  instructions.push(withRemainingAccounts(initIx, remaining));

  return {
    label: "kamino:market:init",
    instructions,
    lookupTableAddresses: args.lookupTableAddresses,
  };
}

export interface KaminoMarketDepositArgs {
  manager: KeyPairSigner;
  vault: Address;
  assetMint: Address;
  assetTokenProgram: Address;
  /** klend reserve the strategy lends into; used as the Voltr strategy id. */
  reserve: Address;
  /** Raw asset amount in smallest units. */
  amount: bigint;
  lookupTableAddresses?: Address[];
}

/**
 * `kamino:market:deposit` — deposit vault assets into a klend reserve via the
 * Voltr Kamino adaptor. The manager signs; `amount` is the raw asset amount.
 */
export async function buildKaminoMarketDepositOperation(
  ctx: ScriptContext,
  args: KaminoMarketDepositArgs
): Promise<BuiltOperation> {
  const strategy = args.reserve;
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

  const reserve = await loadMarketReserveAccounts(ctx.rpc, {
    reserve: args.reserve,
    vaultStrategyAuth,
  });

  const remaining: AccountMeta[] = [
    writableAccount(reserve.obligation),
    readonlyAccount(reserve.lendingMarket),
    readonlyAccount(reserve.lendingMarketAuthority),
    writableAccount(args.reserve),
    writableAccount(reserve.reserveLiquiditySupply),
    writableAccount(reserve.reserveCollateralMint),
    writableAccount(reserve.reserveCollateralSupplyVault),
    readonlyAccount(TOKEN_PROGRAM_ADDRESS),
    readonlyAccount(SYSVAR_INSTRUCTIONS_ADDRESS),
    writableAccount(reserve.obligationFarm),
    writableAccount(reserve.reserveFarmState),
    writableAccount(reserve.userMetadata),
    readonlyAccount(reserve.scope),
    readonlyAccount(SYSVAR_RENT_ADDRESS),
    readonlyAccount(SYSTEM_PROGRAM_ID),
    readonlyAccount(FARMS_PROGRAM_ID),
    readonlyAccount(KLEND_PROGRAM_ID),
  ];

  const depositIx = await getDepositStrategyInstructionAsync({
    manager: args.manager,
    vault: args.vault,
    strategy,
    vaultAssetMint: args.assetMint,
    assetTokenProgram: args.assetTokenProgram,
    adaptorProgram: KAMINO_ADAPTOR_PROGRAM_ID,
    amount: args.amount,
    instructionDiscriminator: new Uint8Array(
      KAMINO_DISCRIMINATOR.DEPOSIT_MARKET
    ),
    additionalArgs: null,
  });
  instructions.push(withRemainingAccounts(depositIx, remaining));

  return {
    label: "kamino:market:deposit",
    instructions,
    lookupTableAddresses: args.lookupTableAddresses,
  };
}

export interface KaminoMarketWithdrawArgs {
  manager: KeyPairSigner;
  vault: Address;
  assetMint: Address;
  assetTokenProgram: Address;
  /** klend reserve the strategy lends into; used as the Voltr strategy id. */
  reserve: Address;
  /** Raw asset amount in smallest units (pass a large value to withdraw all). */
  amount: bigint;
  lookupTableAddresses?: Address[];
}

/**
 * `kamino:market:withdraw` — withdraw vault assets from a klend reserve via the
 * Voltr Kamino adaptor. The manager signs; pass a large `amount` to withdraw all.
 */
export async function buildKaminoMarketWithdrawOperation(
  ctx: ScriptContext,
  args: KaminoMarketWithdrawArgs
): Promise<BuiltOperation> {
  const strategy = args.reserve;
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

  const reserve = await loadMarketReserveAccounts(ctx.rpc, {
    reserve: args.reserve,
    vaultStrategyAuth,
  });

  const remaining: AccountMeta[] = [
    writableAccount(reserve.obligation),
    readonlyAccount(reserve.lendingMarket),
    readonlyAccount(reserve.lendingMarketAuthority),
    writableAccount(args.reserve),
    writableAccount(reserve.reserveCollateralSupplyVault),
    writableAccount(reserve.reserveCollateralMint),
    writableAccount(reserve.reserveLiquiditySupply),
    readonlyAccount(TOKEN_PROGRAM_ADDRESS),
    readonlyAccount(SYSVAR_INSTRUCTIONS_ADDRESS),
    writableAccount(reserve.obligationFarm),
    writableAccount(reserve.reserveFarmState),
    readonlyAccount(reserve.scope),
    readonlyAccount(FARMS_PROGRAM_ID),
    readonlyAccount(KLEND_PROGRAM_ID),
  ];

  const withdrawIx = await getWithdrawStrategyInstructionAsync({
    manager: args.manager,
    vault: args.vault,
    strategy,
    vaultAssetMint: args.assetMint,
    assetTokenProgram: args.assetTokenProgram,
    adaptorProgram: KAMINO_ADAPTOR_PROGRAM_ID,
    amount: args.amount,
    instructionDiscriminator: new Uint8Array(
      KAMINO_DISCRIMINATOR.WITHDRAW_MARKET
    ),
    additionalArgs: null,
  });
  instructions.push(withRemainingAccounts(withdrawIx, remaining));

  return {
    label: "kamino:market:withdraw",
    instructions,
    lookupTableAddresses: args.lookupTableAddresses,
  };
}

export interface KaminoMarketClaimRewardArgs {
  manager: KeyPairSigner;
  vault: Address;
  assetMint: Address;
  assetTokenProgram: Address;
  /** klend reserve the strategy lends into; used as the Voltr strategy id. */
  reserve: Address;
  /** Reward mint being claimed from the reserve's collateral farm. */
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
 * `kamino:market:claim-reward` — claim a klend reserve farm reward into the
 * vault asset for one farm. Passing `rewardIndex` selects a specific reward slot
 * and switches to the `-with-index` adaptor discriminator (and command label).
 *
 * This operates on a single, already-resolved farm/reward. Discovering the
 * claimable farms (farms SDK) and building the Jupiter route are CLI-layer
 * concerns; see docs/kamino.md.
 */
export async function buildKaminoMarketClaimRewardOperation(
  ctx: ScriptContext,
  args: KaminoMarketClaimRewardArgs
): Promise<BuiltOperation> {
  const strategy = args.reserve;
  const [vaultStrategyAuth] = await findVaultStrategyAuthPda({
    vault: args.vault,
    strategy,
  });

  const reserve = await loadMarketReserveAccounts(ctx.rpc, {
    reserve: args.reserve,
    vaultStrategyAuth,
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
    writableAccount(reserve.obligation),
    writableAccount(reserve.lendingMarket),
    writableAccount(args.reserve),
    writableAccount(args.userState),
    writableAccount(args.farmState),
    readonlyAccount(FARM_GLOBAL_CONFIG),
    readonlyAccount(args.rewardMint),
    writableAccount(userRewardAta),
    writableAccount(rewardsVault),
    writableAccount(rewardsTreasuryVault),
    readonlyAccount(farmVaultsAuthority),
    readonlyAccount(reserve.scope),
    readonlyAccount(args.rewardTokenProgram),
    readonlyAccount(FARMS_PROGRAM_ID),
    readonlyAccount(KLEND_PROGRAM_ID),
  ];

  const discriminator =
    args.rewardIndex === undefined
      ? KAMINO_DISCRIMINATOR.CLAIM_MARKET_REWARD
      : KAMINO_DISCRIMINATOR.CLAIM_MARKET_REWARD_WITH_INDEX;

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
      ...(args.jupiterSwap?.swapAccounts ?? []),
    ])
  );

  return {
    // The base and `-with-index` CLI variants build different adaptor
    // discriminators, so the label reflects which one ran (command == label).
    label:
      args.rewardIndex === undefined
        ? "kamino:market:claim-reward"
        : "kamino:market:claim-reward-with-index",
    instructions,
    lookupTableAddresses: [
      ...(args.lookupTableAddresses ?? []),
      ...(args.jupiterSwap?.lookupTableAddresses ?? []),
    ],
  };
}

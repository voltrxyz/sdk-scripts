import type { AccountMeta, Address, Instruction, KeyPairSigner } from "@solana/kit";
import {
  findAssociatedTokenPda,
  getCreateAssociatedTokenIdempotentInstructionAsync,
  TOKEN_PROGRAM_ADDRESS,
} from "@solana-program/token";
import {
  findVaultStrategyAuthPda,
  getWithdrawStrategyInstructionAsync,
} from "@voltr/vault-sdk";
import type { BuiltOperation, ScriptContext } from "@voltr/scripts-core";
import { readonlyAccount, withRemainingAccounts, writableAccount } from "../account-meta.js";
import {
  FARM_GLOBAL_CONFIG,
  FARMS_PROGRAM_ID,
  KAMINO_ADAPTOR_PROGRAM_ID,
  KAMINO_DISCRIMINATOR,
  KLEND_PROGRAM_ID,
  SCOPE,
} from "../constants.js";
import { loadKvaultReserves } from "../kvault.js";
import {
  findFarmRewardsTreasuryVaultPda,
  findFarmRewardsVaultPda,
  findFarmVaultsAuthorityPda,
  findKvaultSharesMintPda,
} from "../pda.js";
import { buildClaimAdditionalArgs, type KaminoJupiterSwap } from "../swap.js";

export interface KaminoKvaultClaimRewardsArgs {
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
 * `kamino:kvault:claim-rewards` — claim a Kamino vault farm reward into the
 * vault asset for one farm. Ports `manager-claim-kvault-rewards.ts` and
 * `manager-claim-kvault-rewards-with-index.ts` (via the optional `rewardIndex`).
 *
 * This operates on a single, already-resolved farm/reward. Discovering the
 * claimable farms (farms SDK) and building the Jupiter route are CLI-layer
 * concerns; see the migration docs.
 */
export async function buildKaminoKvaultClaimRewardsOperation(
  ctx: ScriptContext,
  args: KaminoKvaultClaimRewardsArgs
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
    label: "kamino:kvault:claim-rewards",
    instructions,
    lookupTableAddresses: [
      ...(args.lookupTableAddresses ?? []),
      vaultLookupTable,
      ...(args.jupiterSwap?.lookupTableAddresses ?? []),
    ],
  };
}

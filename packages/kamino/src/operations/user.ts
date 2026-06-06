import type { Address, Instruction, KeyPairSigner } from "@solana/kit";
import { TOKEN_PROGRAM_ADDRESS } from "@solana-program/token";
import {
  findRequestWithdrawVaultReceiptPda,
  findVaultLpMintPda,
  findVaultStrategyAuthPda,
  getDirectWithdrawStrategyInstructionAsync,
  getRequestWithdrawVaultInstructionAsync,
} from "@voltr/vault-sdk";
import {
  setupTokenAccount,
  withRemainingAccounts,
  type BuiltOperation,
  type ScriptContext,
} from "@voltr/scripts-core";
import { KAMINO_ADAPTOR_PROGRAM_ID } from "../constants.js";
import { buildKvaultWithdrawAccounts } from "../kvault.js";

export interface KaminoUserDirectWithdrawArgs {
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
 * `kamino:user:direct-withdraw` — a user directly withdraws their share of a
 * Kamino vault strategy. Migrated from `user-direct-withdraw-strategy.ts`.
 */
export async function buildKaminoUserDirectWithdrawOperation(
  ctx: ScriptContext,
  args: KaminoUserDirectWithdrawArgs
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
    label: "kamino:user:direct-withdraw",
    instructions,
    lookupTableAddresses: [
      ...(args.lookupTableAddresses ?? []),
      vaultLookupTable,
    ],
  };
}

export interface KaminoUserRequestAndDirectWithdrawArgs {
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
 * `kamino:user:request-and-direct-withdraw` — request a vault withdrawal and
 * directly withdraw from the Kamino vault strategy in one transaction. Migrated
 * from `user-request-and-direct-withdraw-strategy.ts`.
 */
export async function buildKaminoUserRequestAndDirectWithdrawOperation(
  ctx: ScriptContext,
  args: KaminoUserRequestAndDirectWithdrawArgs
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
    label: "kamino:user:request-and-direct-withdraw",
    instructions,
    lookupTableAddresses: [
      ...(args.lookupTableAddresses ?? []),
      vaultLookupTable,
    ],
  };
}

import {
  findAssociatedTokenPda,
  getCloseAccountInstruction,
  getCreateAssociatedTokenIdempotentInstructionAsync,
  getSyncNativeInstruction,
  TOKEN_PROGRAM_ADDRESS,
} from "@solana-program/token";
import { getTransferSolInstruction } from "@solana-program/system";
import {
  findRequestWithdrawVaultReceiptPda,
  findVaultLpMintPda,
  getCancelRequestWithdrawVaultInstructionAsync,
  getDepositVaultInstructionAsync,
  getInstantWithdrawVaultInstructionAsync,
  getRequestWithdrawVaultInstructionAsync,
  getWithdrawVaultInstructionAsync,
} from "@voltr/vault-sdk";
import {
  type Address,
  type Instruction,
  type KeyPairSigner,
} from "@solana/kit";
import type { BuiltOperation, ScriptContext } from "../types.js";
import { setupTokenAccount } from "../token/accounts.js";
import { NATIVE_MINT } from "./constants.js";

export interface DepositVaultArgs {
  user: KeyPairSigner;
  vault: Address;
  assetMint: Address;
  assetTokenProgram: Address;
  amount: bigint;
  lookupTableAddresses?: Address[];
}

export async function buildDepositVaultOperation(
  ctx: ScriptContext,
  args: DepositVaultArgs
): Promise<BuiltOperation> {
  const instructions: Instruction[] = [];
  const [userAssetAta] = await findAssociatedTokenPda({
    owner: args.user.address,
    mint: args.assetMint,
    tokenProgram: args.assetTokenProgram,
  });

  if (args.assetMint === NATIVE_MINT) {
    instructions.push(
      await getCreateAssociatedTokenIdempotentInstructionAsync({
        payer: args.user,
        owner: args.user.address,
        mint: NATIVE_MINT,
        tokenProgram: TOKEN_PROGRAM_ADDRESS,
      })
    );
    instructions.push(
      getTransferSolInstruction({
        source: args.user,
        destination: userAssetAta,
        amount: args.amount,
      })
    );
    instructions.push(getSyncNativeInstruction({ account: userAssetAta }));
  }

  const [vaultLpMint] = await findVaultLpMintPda({ vault: args.vault });
  await setupTokenAccount({
    rpc: ctx.rpc,
    payer: args.user,
    mint: vaultLpMint,
    owner: args.user.address,
    instructions,
  });

  instructions.push(
    await getDepositVaultInstructionAsync({
      userTransferAuthority: args.user,
      vault: args.vault,
      vaultAssetMint: args.assetMint,
      assetTokenProgram: args.assetTokenProgram,
      amount: args.amount,
    })
  );

  if (args.assetMint === NATIVE_MINT) {
    instructions.push(
      getCloseAccountInstruction({
        account: userAssetAta,
        destination: args.user.address,
        owner: args.user,
      })
    );
  }

  return {
    label: "vault:deposit",
    instructions,
    lookupTableAddresses: args.lookupTableAddresses,
  };
}

export interface RequestWithdrawVaultArgs {
  user: KeyPairSigner;
  vault: Address;
  /** Raw amount to request, interpreted as LP or asset units per isAmountInLp. */
  amount: bigint;
  /** When true, `amount` is denominated in LP tokens; otherwise in asset units. */
  isAmountInLp: boolean;
  /** When true, requests withdrawal of the user's entire position. */
  isWithdrawAll: boolean;
  lookupTableAddresses?: Address[];
}

/**
 * Builds a request-withdraw operation. Only one request withdrawal can be
 * outstanding per user per vault — the on-chain program rejects a second
 * request while one is pending/unclaimed.
 */
export async function buildRequestWithdrawVaultOperation(
  ctx: ScriptContext,
  args: RequestWithdrawVaultArgs
): Promise<BuiltOperation> {
  const instructions: Instruction[] = [];

  const [vaultLpMint] = await findVaultLpMintPda({ vault: args.vault });
  const [requestWithdrawVaultReceipt] =
    await findRequestWithdrawVaultReceiptPda({
      vault: args.vault,
      userTransferAuthority: args.user.address,
    });

  // The LP escrow ATA is owned by the request-withdraw receipt PDA, not the user.
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
      amount: args.amount,
      isAmountInLp: args.isAmountInLp,
      isWithdrawAll: args.isWithdrawAll,
    })
  );

  return {
    label: "vault:request-withdraw",
    instructions,
    lookupTableAddresses: args.lookupTableAddresses,
  };
}

export interface CancelRequestWithdrawVaultArgs {
  user: KeyPairSigner;
  vault: Address;
  lookupTableAddresses?: Address[];
}

/**
 * Builds a cancel-request-withdraw operation. Succeeds only when the user has a
 * request withdrawal outstanding for the vault.
 */
export async function buildCancelRequestWithdrawVaultOperation(
  _ctx: ScriptContext,
  args: CancelRequestWithdrawVaultArgs
): Promise<BuiltOperation> {
  const cancelRequestWithdrawVaultIx =
    await getCancelRequestWithdrawVaultInstructionAsync({
      userTransferAuthority: args.user,
      vault: args.vault,
    });

  return {
    label: "vault:cancel-request-withdraw",
    instructions: [cancelRequestWithdrawVaultIx],
    lookupTableAddresses: args.lookupTableAddresses,
  };
}

export interface WithdrawVaultArgs {
  user: KeyPairSigner;
  vault: Address;
  assetMint: Address;
  assetTokenProgram: Address;
  lookupTableAddresses?: Address[];
}

/**
 * Builds a withdraw operation that claims a previously requested withdrawal.
 * Assumes the user has an outstanding request; the on-chain program throws
 * otherwise.
 */
export async function buildWithdrawVaultOperation(
  _ctx: ScriptContext,
  args: WithdrawVaultArgs
): Promise<BuiltOperation> {
  const instructions: Instruction[] = [];

  const [userAssetAta] = await findAssociatedTokenPda({
    owner: args.user.address,
    mint: args.assetMint,
    tokenProgram: args.assetTokenProgram,
  });
  instructions.push(
    await getCreateAssociatedTokenIdempotentInstructionAsync({
      payer: args.user,
      owner: args.user.address,
      mint: args.assetMint,
      tokenProgram: args.assetTokenProgram,
    })
  );

  instructions.push(
    await getWithdrawVaultInstructionAsync({
      userTransferAuthority: args.user,
      vault: args.vault,
      vaultAssetMint: args.assetMint,
      assetTokenProgram: args.assetTokenProgram,
    })
  );

  if (args.assetMint === NATIVE_MINT) {
    instructions.push(
      getCloseAccountInstruction({
        account: userAssetAta,
        destination: args.user.address,
        owner: args.user,
      })
    );
  }

  return {
    label: "vault:withdraw",
    instructions,
    lookupTableAddresses: args.lookupTableAddresses,
  };
}

export interface InstantWithdrawVaultArgs {
  user: KeyPairSigner;
  vault: Address;
  assetMint: Address;
  assetTokenProgram: Address;
  amount: bigint;
  isAmountInLp: boolean;
  isWithdrawAll: boolean;
  lookupTableAddresses?: Address[];
}

/**
 * Builds an instant-withdraw operation. Redeems LP directly against the vault's
 * idle assets in a single transaction (no request/claim cycle).
 */
export async function buildInstantWithdrawVaultOperation(
  ctx: ScriptContext,
  args: InstantWithdrawVaultArgs
): Promise<BuiltOperation> {
  const instructions: Instruction[] = [];

  const userAssetAta = await setupTokenAccount({
    rpc: ctx.rpc,
    payer: args.user,
    mint: args.assetMint,
    owner: args.user.address,
    instructions,
    tokenProgram: args.assetTokenProgram,
  });

  instructions.push(
    await getInstantWithdrawVaultInstructionAsync({
      userTransferAuthority: args.user,
      vault: args.vault,
      vaultAssetMint: args.assetMint,
      assetTokenProgram: args.assetTokenProgram,
      amount: args.amount,
      isAmountInLp: args.isAmountInLp,
      isWithdrawAll: args.isWithdrawAll,
    })
  );

  if (args.assetMint === NATIVE_MINT) {
    instructions.push(
      getCloseAccountInstruction({
        account: userAssetAta,
        destination: args.user.address,
        owner: args.user,
      })
    );
  }

  return {
    label: "vault:instant-withdraw",
    instructions,
    lookupTableAddresses: args.lookupTableAddresses,
  };
}

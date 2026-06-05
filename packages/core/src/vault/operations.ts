import {
  findAssociatedTokenPda,
  getCloseAccountInstruction,
  getCreateAssociatedTokenIdempotentInstructionAsync,
  getSyncNativeInstruction,
  TOKEN_PROGRAM_ADDRESS,
} from "@solana-program/token";
import { getTransferSolInstruction } from "@solana-program/system";
import {
  findVaultLpMintPda,
  getDepositVaultInstructionAsync,
} from "@voltr/vault-sdk";
import {
  type Address,
  type Instruction,
  type KeyPairSigner,
} from "@solana/kit";
import type { BuiltOperation, ScriptContext } from "../types.js";
import { setupTokenAccount } from "../token/accounts.js";

const NATIVE_MINT =
  "So11111111111111111111111111111111111111112" as Address;

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


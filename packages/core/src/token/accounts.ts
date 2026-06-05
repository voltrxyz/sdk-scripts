import {
  TOKEN_PROGRAM_ADDRESS,
  findAssociatedTokenPda,
  getCreateAssociatedTokenIdempotentInstructionAsync,
} from "@solana-program/token";
import {
  type Address,
  type Instruction,
  type TransactionSigner,
} from "@solana/kit";
import type { SolanaRpc } from "../types.js";

export async function setupTokenAccount(args: {
  rpc: SolanaRpc;
  payer: TransactionSigner;
  mint: Address;
  owner: Address;
  instructions: Instruction[];
  tokenProgram?: Address;
}): Promise<Address> {
  const tokenProgram = args.tokenProgram ?? TOKEN_PROGRAM_ADDRESS;
  const [ata] = await findAssociatedTokenPda({
    owner: args.owner,
    mint: args.mint,
    tokenProgram,
  });

  const accountInfo = await args.rpc.getAccountInfo(ata).send();
  if (!accountInfo.value) {
    args.instructions.push(
      await getCreateAssociatedTokenIdempotentInstructionAsync({
        payer: args.payer,
        owner: args.owner,
        mint: args.mint,
        tokenProgram,
      })
    );
  }

  return ata;
}


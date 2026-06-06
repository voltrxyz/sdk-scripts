import type { Address, Instruction, KeyPairSigner } from "@solana/kit";
import { TOKEN_PROGRAM_ADDRESS } from "@solana-program/token";
import {
  findVaultStrategyAuthPda,
  getDirectWithdrawStrategyInstructionAsync,
} from "@voltr/vault-sdk";
import {
  setupTokenAccount,
  type BuiltOperation,
  type ScriptContext,
} from "@voltr/scripts-core";
import { withRemainingAccounts } from "../account-meta.js";
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
 * Kamino vault strategy. Ports `user-direct-withdraw-strategy.ts`.
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

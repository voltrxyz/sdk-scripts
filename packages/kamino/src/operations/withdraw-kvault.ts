import type { Address, Instruction, KeyPairSigner } from "@solana/kit";
import { TOKEN_PROGRAM_ADDRESS } from "@solana-program/token";
import {
  findVaultStrategyAuthPda,
  getWithdrawStrategyInstructionAsync,
} from "@voltr/vault-sdk";
import {
  setupTokenAccount,
  type BuiltOperation,
  type ScriptContext,
} from "@voltr/scripts-core";
import { withRemainingAccounts } from "../account-meta.js";
import {
  KAMINO_ADAPTOR_PROGRAM_ID,
  KAMINO_DISCRIMINATOR,
} from "../constants.js";
import { buildKvaultWithdrawAccounts } from "../kvault.js";

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
 * Voltr Kamino adaptor. Ports `manager-withdraw-kvault.ts`.
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

import type { Address, Instruction, KeyPairSigner } from "@solana/kit";
import { TOKEN_PROGRAM_ADDRESS } from "@solana-program/token";
import {
  findVaultStrategyAuthPda,
  getInitializeStrategyInstructionAsync,
} from "@voltr/vault-sdk";
import {
  setupTokenAccount,
  type BuiltOperation,
  type ScriptContext,
} from "@voltr/scripts-core";
import {
  KAMINO_ADAPTOR_PROGRAM_ID,
  KAMINO_DISCRIMINATOR,
} from "../constants.js";
import { findKvaultSharesMintPda } from "../pda.js";

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
 * Ports `manager-initialize-kvault.ts`.
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

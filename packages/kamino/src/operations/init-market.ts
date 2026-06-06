import type { AccountMeta, Address, Instruction, KeyPairSigner } from "@solana/kit";
import {
  findVaultStrategyAuthPda,
  getInitializeStrategyInstructionAsync,
} from "@voltr/vault-sdk";
import {
  setupTokenAccount,
  type BuiltOperation,
  type ScriptContext,
} from "@voltr/scripts-core";
import { readonlyAccount, withRemainingAccounts, writableAccount } from "../account-meta.js";
import {
  FARMS_PROGRAM_ID,
  KAMINO_ADAPTOR_PROGRAM_ID,
  KAMINO_DISCRIMINATOR,
  KLEND_PROGRAM_ID,
  SYSVAR_RENT_ADDRESS,
} from "../constants.js";
import { loadMarketReserveAccounts } from "../reserve.js";

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
 * Ports `manager-initialize-market.ts`.
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

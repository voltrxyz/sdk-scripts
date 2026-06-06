import type { AccountMeta, Address, Instruction, KeyPairSigner } from "@solana/kit";
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
import { readonlyAccount, withRemainingAccounts, writableAccount } from "../account-meta.js";
import {
  FARMS_PROGRAM_ID,
  KAMINO_ADAPTOR_PROGRAM_ID,
  KAMINO_DISCRIMINATOR,
  KLEND_PROGRAM_ID,
  SYSVAR_INSTRUCTIONS_ADDRESS,
} from "../constants.js";
import { loadMarketReserveAccounts } from "../reserve.js";

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
 * Voltr Kamino adaptor. Ports `manager-withdraw-market.ts`.
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

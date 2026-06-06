import {
  AccountRole,
  type AccountMeta,
  type Address,
  type Instruction,
  type KeyPairSigner,
} from "@solana/kit";
import { ASSOCIATED_TOKEN_PROGRAM_ADDRESS } from "@solana-program/token";
import { SYSTEM_PROGRAM_ADDRESS } from "@solana-program/system";
import {
  getDepositStrategyInstructionAsync,
  getInitializeStrategyInstructionAsync,
  getWithdrawStrategyInstructionAsync,
} from "@voltr/vault-sdk";
import {
  buildExtendLookupTableInstructions,
  collectInstructionAddresses,
  setupTokenAccount,
  type BuiltOperation,
  type ScriptContext,
} from "@voltr/scripts-core";
import {
  ADAPTOR_PROGRAM_ID,
  DISCRIMINATOR,
  JUPITER_LEND_PROGRAM_ID,
  JUPITER_LIQUIDITY_PROGRAM_ID,
} from "../constants.js";
import { deriveJupiterEarnAccounts } from "../pda.js";
import { appendRemainingAccounts } from "../util.js";

export interface SpotEarnInitArgs {
  /** Manager keypair; also funds the new strategy accounts (payer). */
  manager: KeyPairSigner;
  vault: Address;
  assetMint: Address;
  assetTokenProgram: Address;
  lookupTableAddresses?: Address[];
}

export interface SpotEarnAmountArgs {
  manager: KeyPairSigner;
  vault: Address;
  assetMint: Address;
  assetTokenProgram: Address;
  /** Amount in vault-asset base units to deposit into / withdraw from the Earn strategy. */
  amount: bigint;
  lookupTableAddresses?: Address[];
}

export interface SpotEarnExtendLookupTableArgs {
  /** Keypair that pays for and is the authority of the lookup table. */
  manager: KeyPairSigner;
  vault: Address;
  assetMint: Address;
  assetTokenProgram: Address;
  /** Existing lookup table to extend with the Earn strategy's accounts. */
  lookupTable: Address;
}

/**
 * `spot:earn:init` — initialize a Jupiter Earn (lending) strategy. The strategy
 * address is the Jupiter `lending` PDA. Creates the strategy auth's asset and
 * fToken token accounts.
 *
 * Migrated from `manager-initialize-earn.ts` (first transaction only). The legacy
 * script's optional second transaction — pre-loading the lookup table — is its
 * own operation here: {@link buildSpotEarnExtendLookupTableOperation}.
 */
export async function buildSpotEarnInitOperation(
  ctx: ScriptContext,
  args: SpotEarnInitArgs
): Promise<BuiltOperation> {
  const instructions: Instruction[] = [];

  const earn = await deriveJupiterEarnAccounts({
    vault: args.vault,
    assetMint: args.assetMint,
    assetTokenProgram: args.assetTokenProgram,
  });

  await setupTokenAccount({
    rpc: ctx.rpc,
    payer: args.manager,
    mint: args.assetMint,
    owner: earn.vaultStrategyAuth,
    instructions,
    tokenProgram: args.assetTokenProgram,
  });
  await setupTokenAccount({
    rpc: ctx.rpc,
    payer: args.manager,
    mint: earn.fTokenMint,
    owner: earn.vaultStrategyAuth,
    instructions,
    tokenProgram: args.assetTokenProgram,
  });

  const initializeStrategyIx = await getInitializeStrategyInstructionAsync({
    payer: args.manager,
    manager: args.manager,
    vault: args.vault,
    strategy: earn.lending,
    adaptorProgram: ADAPTOR_PROGRAM_ID,
    instructionDiscriminator: DISCRIMINATOR.INITIALIZE_JUPITER_EARN,
    additionalArgs: null,
  });
  instructions.push(initializeStrategyIx);

  return {
    label: "spot:earn:init",
    instructions,
    lookupTableAddresses: args.lookupTableAddresses,
  };
}

/**
 * `spot:earn:deposit` — deposit `amount` of the vault asset into the Jupiter
 * Earn strategy.
 *
 * Migrated from `manager-deposit-earn.ts`.
 */
export async function buildSpotEarnDepositOperation(
  ctx: ScriptContext,
  args: SpotEarnAmountArgs
): Promise<BuiltOperation> {
  const earn = await deriveJupiterEarnAccounts({
    vault: args.vault,
    assetMint: args.assetMint,
    assetTokenProgram: args.assetTokenProgram,
  });

  const remainingAccounts: AccountMeta<Address>[] = [
    { address: earn.vaultStrategyFTokenAta, role: AccountRole.WRITABLE },
    { address: earn.lendingAdmin, role: AccountRole.READONLY },
    { address: earn.fTokenMint, role: AccountRole.WRITABLE },
    { address: earn.supplyTokenReservesLiquidity, role: AccountRole.WRITABLE },
    {
      address: earn.lendingSupplyPositionOnLiquidity,
      role: AccountRole.WRITABLE,
    },
    { address: earn.rateModel, role: AccountRole.READONLY },
    { address: earn.jVault, role: AccountRole.WRITABLE },
    { address: earn.liquidity, role: AccountRole.WRITABLE },
    { address: JUPITER_LIQUIDITY_PROGRAM_ID, role: AccountRole.WRITABLE },
    { address: earn.rewardsRateModel, role: AccountRole.READONLY },
    { address: ASSOCIATED_TOKEN_PROGRAM_ADDRESS, role: AccountRole.READONLY },
    { address: SYSTEM_PROGRAM_ADDRESS, role: AccountRole.WRITABLE },
    { address: JUPITER_LEND_PROGRAM_ID, role: AccountRole.WRITABLE },
  ];

  const depositStrategyIx = await getDepositStrategyInstructionAsync({
    manager: args.manager,
    vault: args.vault,
    strategy: earn.lending,
    vaultAssetMint: args.assetMint,
    assetTokenProgram: args.assetTokenProgram,
    adaptorProgram: ADAPTOR_PROGRAM_ID,
    amount: args.amount,
    instructionDiscriminator: DISCRIMINATOR.DEPOSIT_JUPITER_EARN,
    additionalArgs: null,
  });

  return {
    label: "spot:earn:deposit",
    instructions: [appendRemainingAccounts(depositStrategyIx, remainingAccounts)],
    lookupTableAddresses: args.lookupTableAddresses,
  };
}

/**
 * `spot:earn:withdraw` — withdraw `amount` of the vault asset from the Jupiter
 * Earn strategy. Mirrors the deposit account layout plus the `userClaim` PDA.
 *
 * Migrated from `manager-withdraw-earn.ts`.
 */
export async function buildSpotEarnWithdrawOperation(
  ctx: ScriptContext,
  args: SpotEarnAmountArgs
): Promise<BuiltOperation> {
  const earn = await deriveJupiterEarnAccounts({
    vault: args.vault,
    assetMint: args.assetMint,
    assetTokenProgram: args.assetTokenProgram,
  });

  const remainingAccounts: AccountMeta<Address>[] = [
    { address: earn.vaultStrategyFTokenAta, role: AccountRole.WRITABLE },
    { address: earn.lendingAdmin, role: AccountRole.READONLY },
    { address: earn.fTokenMint, role: AccountRole.WRITABLE },
    { address: earn.supplyTokenReservesLiquidity, role: AccountRole.WRITABLE },
    {
      address: earn.lendingSupplyPositionOnLiquidity,
      role: AccountRole.WRITABLE,
    },
    { address: earn.rateModel, role: AccountRole.READONLY },
    { address: earn.jVault, role: AccountRole.WRITABLE },
    { address: earn.userClaim, role: AccountRole.WRITABLE },
    { address: earn.liquidity, role: AccountRole.WRITABLE },
    { address: JUPITER_LIQUIDITY_PROGRAM_ID, role: AccountRole.WRITABLE },
    { address: earn.rewardsRateModel, role: AccountRole.READONLY },
    { address: ASSOCIATED_TOKEN_PROGRAM_ADDRESS, role: AccountRole.READONLY },
    { address: SYSTEM_PROGRAM_ADDRESS, role: AccountRole.WRITABLE },
    { address: JUPITER_LEND_PROGRAM_ID, role: AccountRole.WRITABLE },
  ];

  const withdrawStrategyIx = await getWithdrawStrategyInstructionAsync({
    manager: args.manager,
    vault: args.vault,
    strategy: earn.lending,
    vaultAssetMint: args.assetMint,
    assetTokenProgram: args.assetTokenProgram,
    adaptorProgram: ADAPTOR_PROGRAM_ID,
    amount: args.amount,
    instructionDiscriminator: DISCRIMINATOR.WITHDRAW_JUPITER_EARN,
    additionalArgs: null,
  });

  return {
    label: "spot:earn:withdraw",
    instructions: [
      appendRemainingAccounts(withdrawStrategyIx, remainingAccounts),
    ],
    lookupTableAddresses: args.lookupTableAddresses,
  };
}

/**
 * `spot:earn:extend-lut` — extend an existing lookup table with every account
 * the Earn strategy's init/deposit/withdraw transactions touch, so they fit
 * within transaction size limits. Already-present addresses are skipped.
 *
 * Migrated from the second (optional) transaction of `manager-initialize-earn.ts`.
 */
export async function buildSpotEarnExtendLookupTableOperation(
  ctx: ScriptContext,
  args: SpotEarnExtendLookupTableArgs
): Promise<BuiltOperation> {
  const earn = await deriveJupiterEarnAccounts({
    vault: args.vault,
    assetMint: args.assetMint,
    assetTokenProgram: args.assetTokenProgram,
  });

  const initializeStrategyIx = await getInitializeStrategyInstructionAsync({
    payer: args.manager,
    manager: args.manager,
    vault: args.vault,
    strategy: earn.lending,
    adaptorProgram: ADAPTOR_PROGRAM_ID,
    instructionDiscriminator: DISCRIMINATOR.INITIALIZE_JUPITER_EARN,
    additionalArgs: null,
  });

  const addresses = Array.from(
    new Set<Address>([
      ...collectInstructionAddresses([initializeStrategyIx]),
      earn.fTokenMint,
      earn.lendingAdmin,
      earn.supplyTokenReservesLiquidity,
      earn.rateModel,
      earn.userClaim,
      earn.liquidity,
      earn.rewardsRateModel,
      earn.lendingSupplyPositionOnLiquidity,
      earn.jVault,
    ])
  );

  const instructions = await buildExtendLookupTableInstructions({
    rpc: ctx.rpc,
    payer: args.manager,
    authority: args.manager,
    lookupTable: args.lookupTable,
    addresses,
  });

  return {
    label: "spot:earn:extend-lut",
    instructions,
    lookupTableAddresses: [],
  };
}

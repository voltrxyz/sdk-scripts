import {
  AccountRole,
  type AccountMeta,
  type Address,
  type Instruction,
  type KeyPairSigner,
} from "@solana/kit";
import {
  findVaultStrategyAuthPda,
  getDepositStrategyInstructionAsync,
  getInitializeStrategyInstructionAsync,
  getWithdrawStrategyInstructionAsync,
} from "@voltr/vault-sdk";
import {
  setupTokenAccount,
  withRemainingAccounts,
  type BuiltOperation,
  type ScriptContext,
} from "@voltr/scripts-core";
import { SPOT_ADAPTOR_PROGRAM_ID, SPOT_DISCRIMINATOR } from "../constants.js";
import { findSpotOracleInitReceiptPda } from "../pda.js";
import { setupJupiterSwap } from "../jupiter.js";

export interface SpotSpotInitArgs {
  /** Manager keypair; also funds the new strategy accounts (payer). */
  manager: KeyPairSigner;
  vault: Address;
  assetMint: Address;
  assetTokenProgram: Address;
  foreignMint: Address;
  foreignTokenProgram: Address;
  assetOracle: Address;
  foreignOracle: Address;
  lookupTableAddresses?: Address[];
}

export interface SpotSpotSwapArgs {
  manager: KeyPairSigner;
  vault: Address;
  assetMint: Address;
  assetTokenProgram: Address;
  foreignMint: Address;
  foreignTokenProgram: Address;
  assetOracle: Address;
  foreignOracle: Address;
  /**
   * Amount to swap, denominated in the input mint of the swap: the vault asset
   * for a buy, the foreign asset for a sell. Also the strategy deposit/withdraw
   * amount.
   */
  amount: bigint;
  slippageBps: number;
  jupiterMaxAccounts: number;
  /** Reject the Jupiter quote if its threshold output falls below this. Defaults to 0. */
  minimumThresholdAmountOut?: bigint;
  lookupTableAddresses?: Address[];
  /** Override the Jupiter swap API base URL. */
  jupiterApiBase?: string;
}

/**
 * `spot:spot:init` — initialize a Spot strategy whose `strategy` address is the
 * foreign mint. Creates the strategy auth's asset and foreign token accounts and
 * registers both Pyth oracle init receipts.
 *
 * Migrated from `manager-initialize-spot.ts`.
 */
export async function buildSpotSpotInitOperation(
  ctx: ScriptContext,
  args: SpotSpotInitArgs
): Promise<BuiltOperation> {
  const instructions: Instruction[] = [];

  const [vaultStrategyAuth] = await findVaultStrategyAuthPda({
    vault: args.vault,
    strategy: args.foreignMint,
  });

  const vaultStrategyAssetAta = await setupTokenAccount({
    rpc: ctx.rpc,
    payer: args.manager,
    mint: args.assetMint,
    owner: vaultStrategyAuth,
    instructions,
    tokenProgram: args.assetTokenProgram,
  });
  const vaultStrategyForeignAta = await setupTokenAccount({
    rpc: ctx.rpc,
    payer: args.manager,
    mint: args.foreignMint,
    owner: vaultStrategyAuth,
    instructions,
    tokenProgram: args.foreignTokenProgram,
  });

  const assetOracleInitReceipt = await findSpotOracleInitReceiptPda({
    vaultStrategyAuth,
    mint: args.assetMint,
  });
  const foreignOracleInitReceipt = await findSpotOracleInitReceiptPda({
    vaultStrategyAuth,
    mint: args.foreignMint,
  });

  const initializeStrategyIx = await getInitializeStrategyInstructionAsync({
    payer: args.manager,
    manager: args.manager,
    vault: args.vault,
    strategy: args.foreignMint,
    adaptorProgram: SPOT_ADAPTOR_PROGRAM_ID,
    instructionDiscriminator: new Uint8Array(SPOT_DISCRIMINATOR.INITIALIZE_SPOT),
    additionalArgs: null,
  });

  const remainingAccounts: AccountMeta<Address>[] = [
    { address: args.assetMint, role: AccountRole.READONLY },
    { address: vaultStrategyAssetAta, role: AccountRole.READONLY },
    { address: args.assetTokenProgram, role: AccountRole.READONLY },
    { address: args.assetOracle, role: AccountRole.READONLY },
    { address: assetOracleInitReceipt, role: AccountRole.WRITABLE },
    { address: vaultStrategyForeignAta, role: AccountRole.READONLY },
    { address: args.foreignTokenProgram, role: AccountRole.READONLY },
    { address: args.foreignOracle, role: AccountRole.READONLY },
    { address: foreignOracleInitReceipt, role: AccountRole.WRITABLE },
  ];

  instructions.push(
    withRemainingAccounts(initializeStrategyIx, remainingAccounts)
  );

  return {
    label: "spot:spot:init",
    instructions,
    lookupTableAddresses: args.lookupTableAddresses,
  };
}

type SpotSwapDirection = "buy" | "sell";

async function buildSpotSwapOperation(
  ctx: ScriptContext,
  args: SpotSpotSwapArgs,
  direction: SpotSwapDirection
): Promise<BuiltOperation> {
  const instructions: Instruction[] = [];

  const [vaultStrategyAuth] = await findVaultStrategyAuthPda({
    vault: args.vault,
    strategy: args.foreignMint,
  });

  // The swap CPIs through the strategy's asset and foreign token accounts; make
  // sure both exist before the deposit/withdraw runs.
  await setupTokenAccount({
    rpc: ctx.rpc,
    payer: args.manager,
    mint: args.assetMint,
    owner: vaultStrategyAuth,
    instructions,
    tokenProgram: args.assetTokenProgram,
  });
  const vaultStrategyForeignAta = await setupTokenAccount({
    rpc: ctx.rpc,
    payer: args.manager,
    mint: args.foreignMint,
    owner: vaultStrategyAuth,
    instructions,
    tokenProgram: args.foreignTokenProgram,
  });

  const assetOracleInitReceipt = await findSpotOracleInitReceiptPda({
    vaultStrategyAuth,
    mint: args.assetMint,
  });
  const foreignOracleInitReceipt = await findSpotOracleInitReceiptPda({
    vaultStrategyAuth,
    mint: args.foreignMint,
  });

  const baseRemaining: AccountMeta<Address>[] = [
    { address: args.assetOracle, role: AccountRole.READONLY },
    { address: assetOracleInitReceipt, role: AccountRole.READONLY },
    { address: vaultStrategyForeignAta, role: AccountRole.WRITABLE },
    { address: args.foreignTokenProgram, role: AccountRole.READONLY },
    { address: args.foreignOracle, role: AccountRole.READONLY },
    { address: foreignOracleInitReceipt, role: AccountRole.READONLY },
  ];

  // Buy spends the vault asset for the foreign asset; sell does the reverse.
  const [inputMint, outputMint] =
    direction === "buy"
      ? [args.assetMint, args.foreignMint]
      : [args.foreignMint, args.assetMint];

  const swap = await setupJupiterSwap({
    amountIn: args.amount,
    minimumThresholdAmountOut: args.minimumThresholdAmountOut ?? 0n,
    authority: vaultStrategyAuth,
    inputMint,
    outputMint,
    slippageBps: args.slippageBps,
    maxAccounts: args.jupiterMaxAccounts,
    apiBase: args.jupiterApiBase,
  });

  const remainingAccounts = [...baseRemaining, ...swap.remainingAccounts];
  const additionalArgs =
    swap.additionalArgs.length > 0 ? swap.additionalArgs : null;

  const strategyInput = {
    manager: args.manager,
    vault: args.vault,
    strategy: args.foreignMint,
    vaultAssetMint: args.assetMint,
    assetTokenProgram: args.assetTokenProgram,
    adaptorProgram: SPOT_ADAPTOR_PROGRAM_ID,
    amount: args.amount,
    instructionDiscriminator: new Uint8Array(SPOT_DISCRIMINATOR.SWAP_SPOT),
    additionalArgs,
  };

  const strategyIx =
    direction === "buy"
      ? await getDepositStrategyInstructionAsync(strategyInput)
      : await getWithdrawStrategyInstructionAsync(strategyInput);

  instructions.push(withRemainingAccounts(strategyIx, remainingAccounts));

  return {
    label: direction === "buy" ? "spot:spot:buy" : "spot:spot:sell",
    instructions,
    lookupTableAddresses: [
      ...(args.lookupTableAddresses ?? []),
      ...swap.lookupTableAddresses,
    ],
  };
}

/**
 * `spot:spot:buy` — deposit `amount` of the vault asset into the Spot strategy,
 * swapping it to the foreign asset through Jupiter.
 *
 * Migrated from `manager-buy-spot.ts`.
 */
export function buildSpotSpotBuyOperation(
  ctx: ScriptContext,
  args: SpotSpotSwapArgs
): Promise<BuiltOperation> {
  return buildSpotSwapOperation(ctx, args, "buy");
}

/**
 * `spot:spot:sell` — withdraw `amount` of the foreign asset from the Spot
 * strategy, swapping it back to the vault asset through Jupiter.
 *
 * Migrated from `manager-sell-spot.ts`. NOTE: the legacy script passed `amountIn
 * = 0` to its Jupiter helper (and the asset→foreign direction), so it never
 * actually built a swap. This builder implements the intended behavior — a
 * foreign→asset swap of `amount` — so that sell is symmetric with buy and
 * produces working swap data.
 */
export function buildSpotSpotSellOperation(
  ctx: ScriptContext,
  args: SpotSpotSwapArgs
): Promise<BuiltOperation> {
  return buildSpotSwapOperation(ctx, args, "sell");
}

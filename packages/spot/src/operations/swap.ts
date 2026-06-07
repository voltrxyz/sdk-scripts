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

export interface SpotSwapInitArgs {
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

export interface SpotSwapArgs {
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
 * `spot:swap:init` — initialize a Spot strategy whose `strategy` address is the
 * foreign mint. Creates the strategy auth's asset and foreign token accounts and
 * registers both Pyth oracle init receipts. The manager signs and pays.
 */
export async function buildSpotSwapInitOperation(
  ctx: ScriptContext,
  args: SpotSwapInitArgs
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
    label: "spot:swap:init",
    instructions,
    lookupTableAddresses: args.lookupTableAddresses,
  };
}

type SpotSwapDirection = "buy" | "sell";

async function buildSpotSwapDirectionOperation(
  ctx: ScriptContext,
  args: SpotSwapArgs,
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
    label: direction === "buy" ? "spot:swap:buy" : "spot:swap:sell",
    instructions,
    lookupTableAddresses: [
      ...(args.lookupTableAddresses ?? []),
      ...swap.lookupTableAddresses,
    ],
  };
}

/**
 * `spot:swap:buy` — deposit `amount` of the vault asset into the Spot strategy,
 * swapping it to the foreign asset through Jupiter. The manager signs.
 */
export function buildSpotSwapBuyOperation(
  ctx: ScriptContext,
  args: SpotSwapArgs
): Promise<BuiltOperation> {
  return buildSpotSwapDirectionOperation(ctx, args, "buy");
}

/**
 * `spot:swap:sell` — withdraw `amount` of the foreign asset from the Spot
 * strategy, swapping it back to the vault asset through Jupiter. The manager
 * signs. Symmetric with `spot:swap:buy`: a foreign→asset swap of `amount`.
 */
export function buildSpotSwapSellOperation(
  ctx: ScriptContext,
  args: SpotSwapArgs
): Promise<BuiltOperation> {
  return buildSpotSwapDirectionOperation(ctx, args, "sell");
}

import {
  appendTransactionMessageInstructions,
  compileTransactionMessage,
  compressTransactionMessageUsingAddressLookupTables,
  createNoopSigner,
  createTransactionMessage,
  getBase58Decoder,
  getCompiledTransactionMessageEncoder,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  type AddressesByLookupTableAddress,
  type Address,
  type Blockhash,
  type Instruction,
} from "@solana/kit";
import { COMPUTE_BUDGET_PROGRAM_ADDRESS } from "@solana-program/compute-budget";

const PLACEHOLDER_BLOCKHASH: {
  blockhash: Blockhash;
  lastValidBlockHeight: bigint;
} = {
  blockhash: "11111111111111111111111111111111" as Blockhash,
  lastValidBlockHeight: 0n,
};

export interface MultisigTxArgs {
  instructions: Instruction[];
  addressesByLookupTable?: AddressesByLookupTableAddress;
  /** Multisig vault PDA that will pay/sign on-chain. */
  multisigAddress: Address;
  /**
   * If true, strip any compute-budget instructions before serializing. Squads
   * and other multisig front-ends typically inject these themselves.
   */
  stripComputeBudget?: boolean;
}

export interface MultisigTxResult {
  base64Message: string;
  base58Message: string;
  explorerUrl: string;
}

/**
 * Produces a serialized transaction-message payload for a multisig front-end
 * (Squads, Realms, etc.). No real signing happens — the payer is a noop signer
 * for the multisig vault address.
 */
export function buildMultisigPayload(args: MultisigTxArgs): MultisigTxResult {
  const filtered = args.stripComputeBudget
    ? args.instructions.filter(
        (ix) => ix.programAddress !== COMPUTE_BUDGET_PROGRAM_ADDRESS
      )
    : args.instructions;

  const payer = createNoopSigner(args.multisigAddress);
  const addressesByLookupTable = args.addressesByLookupTable ?? {};

  let message = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayerSigner(payer, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(PLACEHOLDER_BLOCKHASH, m),
    (m) => appendTransactionMessageInstructions(filtered, m)
  );

  if (Object.keys(addressesByLookupTable).length > 0) {
    message = compressTransactionMessageUsingAddressLookupTables(
      message,
      addressesByLookupTable
    ) as typeof message;
  }

  const compiled = compileTransactionMessage(message);
  const bytes = getCompiledTransactionMessageEncoder().encode(compiled);
  const base64Message = Buffer.from(bytes).toString("base64");
  const base58Message = getBase58Decoder().decode(bytes);
  const explorerUrl = `https://explorer.solana.com/tx/inspector?message=${encodeURIComponent(
    base64Message
  )}&signatures=${encodeURIComponent(JSON.stringify([args.multisigAddress]))}`;

  return { base64Message, base58Message, explorerUrl };
}

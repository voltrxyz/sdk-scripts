import {
  appendTransactionMessageInstructions,
  compressTransactionMessageUsingAddressLookupTables,
  createSolanaRpc,
  createTransactionMessage,
  getBase64EncodedWireTransaction,
  getSignatureFromTransaction,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
  type AddressesByLookupTableAddress,
  type Blockhash,
  type Instruction,
  type KeyPairSigner,
  type Signature,
} from "@solana/kit";
import {
  getSetComputeUnitLimitInstruction,
  getSetComputeUnitPriceInstruction,
} from "@solana-program/compute-budget";
import type { SolanaRpc } from "../types.js";

export async function sendAndConfirmOptimizedTx(
  instructions: Instruction[],
  rpcUrl: string,
  payerSigner: KeyPairSigner,
  addressesByLookupTable: AddressesByLookupTableAddress = {},
  computeUnitLimit: number | null = null
): Promise<Signature> {
  const rpc = createSolanaRpc(rpcUrl);

  const buildMessage = async (
    ixs: Instruction[],
    blockhash: { blockhash: Blockhash; lastValidBlockHeight: bigint }
  ) => {
    let message = pipe(
      createTransactionMessage({ version: 0 }),
      (m) => setTransactionMessageFeePayerSigner(payerSigner, m),
      (m) => setTransactionMessageLifetimeUsingBlockhash(blockhash, m),
      (m) => appendTransactionMessageInstructions(ixs, m)
    );

    if (Object.keys(addressesByLookupTable).length > 0) {
      message = compressTransactionMessageUsingAddressLookupTables(
        message,
        addressesByLookupTable
      ) as typeof message;
    }

    return message;
  };

  const optimalCUs =
    computeUnitLimit ?? (await estimateComputeUnits(rpc, buildMessage, instructions));
  const cuLimitIx = getSetComputeUnitLimitInstruction({ units: optimalCUs });

  const { value: feeBlockhash } = await rpc.getLatestBlockhash().send();
  const feeEstMessage = await buildMessage(
    [...instructions, cuLimitIx],
    feeBlockhash
  );
  const feeEstSigned = await signTransactionMessageWithSigners(feeEstMessage);
  const wireFeeEst = getBase64EncodedWireTransaction(feeEstSigned);

  const microLamports = await estimatePriorityFeeMicroLamports(
    rpcUrl,
    wireFeeEst
  );
  const cuPriceIx = getSetComputeUnitPriceInstruction({ microLamports });

  const { value: sendBlockhash } = await rpc.getLatestBlockhash().send();
  const finalMessage = await buildMessage(
    [...instructions, cuLimitIx, cuPriceIx],
    sendBlockhash
  );
  const signed = await signTransactionMessageWithSigners(finalMessage);
  const wire = getBase64EncodedWireTransaction(signed);
  const signature = getSignatureFromTransaction(signed);

  await rpc
    .sendTransaction(wire, {
      encoding: "base64",
      skipPreflight: false,
      preflightCommitment: "confirmed",
      maxRetries: 5n,
    })
    .send();

  await confirmSignature(rpc, signature, sendBlockhash.lastValidBlockHeight);

  return signature;
}

async function estimateComputeUnits(
  rpc: SolanaRpc,
  buildMessage: (
    ixs: Instruction[],
    blockhash: { blockhash: Blockhash; lastValidBlockHeight: bigint }
  ) => Promise<ReturnType<typeof createTransactionMessage>>,
  instructions: Instruction[]
): Promise<number> {
  const { value: latest } = await rpc.getLatestBlockhash().send();
  const simMessage = await buildMessage(
    [getSetComputeUnitLimitInstruction({ units: 1_400_000 }), ...instructions],
    latest
  );
  const simSigned = await signTransactionMessageWithSigners(simMessage);
  const wireSim = getBase64EncodedWireTransaction(simSigned);

  const sim = await rpc
    .simulateTransaction(wireSim, {
      encoding: "base64",
      replaceRecentBlockhash: true,
      sigVerify: false,
    })
    .send();

  const requiredCUs = sim.value.unitsConsumed;
  if (requiredCUs == null) {
    throw new Error("Failed to estimate compute units");
  }

  return Math.ceil(Number(requiredCUs) * 1.1);
}

async function estimatePriorityFeeMicroLamports(
  rpcUrl: string,
  wireTransaction: string
): Promise<bigint> {
  try {
    const feeEstResp = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "1",
        method: "getPriorityFeeEstimate",
        params: [
          {
            transaction: wireTransaction,
            options: {
              priorityLevel: "High",
              transactionEncoding: "base64",
            },
          },
        ],
      }),
    });
    const feeEstData = await feeEstResp.json();
    const priorityFeeEstimate = feeEstData?.result?.priorityFeeEstimate;
    if (typeof priorityFeeEstimate === "number") {
      return BigInt(Math.ceil(priorityFeeEstimate));
    }
  } catch {
    // Some RPC providers do not support Helius priority-fee estimates.
  }

  return 1n;
}

async function confirmSignature(
  rpc: SolanaRpc,
  signature: Signature,
  lastValidBlockHeight: bigint
): Promise<void> {
  while (true) {
    const { value } = await rpc
      .getSignatureStatuses([signature], { searchTransactionHistory: true })
      .send();
    const status = value[0];

    if (
      status?.confirmationStatus === "confirmed" ||
      status?.confirmationStatus === "finalized"
    ) {
      if (status.err) {
        throw new Error(`Transaction failed: ${JSON.stringify(status.err)}`);
      }
      return;
    }

    const blockHeight = await rpc.getBlockHeight().send();
    if (blockHeight > lastValidBlockHeight) {
      throw new Error(
        `Transaction expired: ${signature} was not confirmed before lastValidBlockHeight ${lastValidBlockHeight}`
      );
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}


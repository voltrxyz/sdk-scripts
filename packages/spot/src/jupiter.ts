import { address, AccountRole, type AccountMeta, type Address } from "@solana/kit";
import { JUPITER_SWAP_API_BASE } from "./constants.js";

/**
 * A single account entry from a Jupiter `swap-instructions` response.
 */
interface JupiterAccountMeta {
  pubkey: string;
  isSigner: boolean;
  isWritable: boolean;
}

interface JupiterSwapInstruction {
  programId: string;
  accounts: JupiterAccountMeta[];
  data: string; // base64
}

interface JupiterSwapInstructionsResponse {
  error?: string;
  swapInstruction: JupiterSwapInstruction;
  addressLookupTableAddresses: string[];
}

interface JupiterQuoteResponse {
  error?: string;
  otherAmountThreshold?: string;
}

export interface JupiterSwapParams {
  /** Input amount, in input-mint base units. A value of `0n` skips the swap. */
  amountIn: bigint;
  /** Reject the quote if its `otherAmountThreshold` falls below this value. */
  minimumThresholdAmountOut: bigint;
  /** Authority the swap instruction is built for (the vault strategy auth PDA). */
  authority: Address;
  inputMint: Address;
  outputMint: Address;
  slippageBps: number;
  maxAccounts: number;
  /** Jupiter swap API base URL. Defaults to the keyless lite host. */
  apiBase?: string;
  /** Injectable fetch, primarily for tests. Defaults to the global `fetch`. */
  fetchFn?: typeof fetch;
}

export interface JupiterSwapResult {
  /**
   * Kit account metas for the Jupiter swap program followed by its accounts.
   * These are appended after the adaptor's own base remaining accounts. Every
   * entry is forced non-signer: the adaptor CPIs into Jupiter with the vault
   * strategy auth PDA as the signer, so no remaining account signs directly.
   */
  remainingAccounts: AccountMeta<Address>[];
  /** Serialized Jupiter swap instruction data, passed as the adaptor's `additionalArgs`. */
  additionalArgs: Uint8Array;
  /** Address lookup tables Jupiter needs to fit the swap into one transaction. */
  lookupTableAddresses: Address[];
}

/**
 * Fetches a Jupiter quote and swap instructions for `amountIn` of `inputMint`
 * into `outputMint`, then shapes them for the Spot adaptor's swap instruction.
 *
 * Returns an empty result (no swap) when `amountIn <= 0n`. This function performs
 * no signing, sending, or CLI I/O; errors are thrown for the caller to handle.
 */
export async function setupJupiterSwap(
  params: JupiterSwapParams
): Promise<JupiterSwapResult> {
  if (params.amountIn <= 0n) {
    return {
      remainingAccounts: [],
      additionalArgs: new Uint8Array(),
      lookupTableAddresses: [],
    };
  }

  const apiBase = params.apiBase ?? JUPITER_SWAP_API_BASE;
  const fetchFn = params.fetchFn ?? fetch;

  const quoteUrl =
    `${apiBase}/quote?inputMint=${params.inputMint}` +
    `&outputMint=${params.outputMint}` +
    `&amount=${params.amountIn.toString()}` +
    `&slippageBps=${params.slippageBps}` +
    `&maxAccounts=${params.maxAccounts}`;

  const quoteResponse = (await (
    await fetchFn(quoteUrl)
  ).json()) as JupiterQuoteResponse;

  if (quoteResponse.error) {
    throw new Error(`Jupiter quote failed: ${quoteResponse.error}`);
  }
  if (quoteResponse.otherAmountThreshold == null) {
    throw new Error("Jupiter quote response is missing otherAmountThreshold");
  }
  if (BigInt(quoteResponse.otherAmountThreshold) < params.minimumThresholdAmountOut) {
    throw new Error("Jupiter swap otherAmountThreshold is too low");
  }

  const swapResponse = (await (
    await fetchFn(`${apiBase}/swap-instructions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        quoteResponse,
        userPublicKey: params.authority,
      }),
    })
  ).json()) as JupiterSwapInstructionsResponse;

  if (swapResponse.error) {
    throw new Error(`Failed to get swap instructions: ${swapResponse.error}`);
  }

  const { swapInstruction, addressLookupTableAddresses } = swapResponse;

  const remainingAccounts: AccountMeta<Address>[] = [
    { address: address(swapInstruction.programId), role: AccountRole.READONLY },
    ...swapInstruction.accounts.map((account) => ({
      address: address(account.pubkey),
      role: account.isWritable ? AccountRole.WRITABLE : AccountRole.READONLY,
    })),
  ];

  return {
    remainingAccounts,
    additionalArgs: new Uint8Array(Buffer.from(swapInstruction.data, "base64")),
    lookupTableAddresses: addressLookupTableAddresses.map((value) =>
      address(value)
    ),
  };
}

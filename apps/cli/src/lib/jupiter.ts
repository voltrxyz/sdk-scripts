import {
  address,
  readonlyAccount,
  writableAccount,
  type Address,
} from "@voltr/scripts-core";
import type { KaminoJupiterSwap } from "@voltr/scripts-kamino";

/**
 * Builds the Jupiter reward→asset swap embedded in a Kamino reward claim.
 *
 * The Kamino claim builders are pure: they take an already-resolved
 * `KaminoJupiterSwap` (swap bytes + accounts + LUTs) and splice it into the
 * adaptor CPI. Resolving the route is an external HTTP call, which the operation
 * package deliberately leaves to the CLI layer (see docs/kamino-migration.md
 * "Claim-reward scope"). This helper performs that call and shapes the response
 * for the builder. It mirrors the kit-native `setupJupiterSwap` in
 * `packages/spot`, but emits the `KaminoJupiterSwap` shape the Kamino builders
 * consume.
 *
 * It performs no signing, sending, or CLI I/O; errors are thrown for the caller.
 */

/** A single account entry from a Jupiter `swap-instructions` response. */
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
}

/** Default Jupiter swap API base. Matches the legacy scripts' keyless lite host. */
const JUPITER_SWAP_API_BASE = "https://lite-api.jup.ag/swap/v1";

export interface KaminoRewardSwapParams {
  /** Reward token being swapped out (Jupiter input mint). */
  rewardMint: Address;
  /** Vault asset the reward is swapped into (Jupiter output mint). */
  assetMint: Address;
  /** Raw reward amount to route, in reward base units. `0n` skips the swap. */
  swapAmount: bigint;
  /**
   * Vault-strategy authority PDA that holds the reward token account and signs
   * the swap CPI; Jupiter builds the swap accounts against this `userPublicKey`.
   */
  authority: Address;
  slippageBps: number;
  maxAccounts: number;
  /** Jupiter swap API base URL. Defaults to the keyless lite host. */
  apiBase?: string;
  /** Injectable fetch, primarily for tests. Defaults to the global `fetch`. */
  fetchFn?: typeof fetch;
}

/**
 * Fetch a Jupiter quote + swap instructions for `swapAmount` of the reward mint
 * into the asset mint, shaped as a `KaminoJupiterSwap`.
 *
 * Returns `undefined` (no swap) when the reward already equals the asset or
 * `swapAmount <= 0n`; the claim builder then claims without an embedded swap.
 * Every swap account is forced non-signer: the adaptor CPIs into Jupiter with
 * the vault-strategy authority PDA as signer, so no remaining account signs.
 */
export async function setupKaminoRewardSwap(
  params: KaminoRewardSwapParams
): Promise<KaminoJupiterSwap | undefined> {
  if (params.swapAmount <= 0n || params.rewardMint === params.assetMint) {
    return undefined;
  }

  const apiBase = params.apiBase ?? JUPITER_SWAP_API_BASE;
  const fetchFn = params.fetchFn ?? fetch;

  const quoteUrl =
    `${apiBase}/quote?inputMint=${params.rewardMint}` +
    `&outputMint=${params.assetMint}` +
    `&amount=${params.swapAmount.toString()}` +
    `&slippageBps=${params.slippageBps}` +
    `&maxAccounts=${params.maxAccounts}`;

  const quoteResponse = (await (
    await fetchFn(quoteUrl)
  ).json()) as JupiterQuoteResponse;

  if (quoteResponse.error) {
    throw new Error(`Jupiter quote failed: ${quoteResponse.error}`);
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

  // Program id first (read-only), then each swap account keeping its writability.
  // Every entry is a non-signer: the adaptor CPIs into Jupiter with the
  // vault-strategy authority PDA as signer, so no remaining account signs.
  const swapAccounts = [
    readonlyAccount(address(swapInstruction.programId)),
    ...swapInstruction.accounts.map((account) =>
      account.isWritable
        ? writableAccount(address(account.pubkey))
        : readonlyAccount(address(account.pubkey))
    ),
  ];

  return {
    swapInstructionData: new Uint8Array(
      Buffer.from(swapInstruction.data, "base64")
    ),
    swapAccounts,
    lookupTableAddresses: addressLookupTableAddresses.map((value) =>
      address(value)
    ),
  };
}

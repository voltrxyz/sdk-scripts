/**
 * Reward→asset Jupiter route resolver for the Kamino claim examples.
 *
 * The Kamino claim builders are pure: they accept a pre-resolved
 * `KaminoJupiterSwap` and splice it into the adaptor CPI. Resolving that route is
 * an HTTP call the builder deliberately leaves to the caller — this is a compact
 * reference implementation a programmatic consumer can copy.
 */
import {
  address,
  readonlyAccount,
  writableAccount,
  type Address,
} from "@voltr/scripts-core";
import type { KaminoJupiterSwap } from "@voltr/scripts-kamino";

const JUPITER_SWAP_API_BASE = "https://lite-api.jup.ag/swap/v1";

export interface RewardSwapParams {
  rewardMint: Address;
  assetMint: Address;
  /** Raw reward amount to route; `0n` (or reward == asset) skips the swap. */
  swapAmount: bigint;
  /** Vault-strategy authority PDA that holds the reward and signs the swap CPI. */
  authority: Address;
  slippageBps: number;
  maxAccounts: number;
}

/**
 * Returns a `KaminoJupiterSwap` for the reward→asset route, or `undefined` (no
 * swap) when the reward already equals the asset or the amount is 0. Every swap
 * account is forced non-signer: the adaptor CPIs into Jupiter with the
 * vault-strategy authority PDA as the signer, so no remaining account signs.
 */
export async function setupRewardSwap(
  params: RewardSwapParams
): Promise<KaminoJupiterSwap | undefined> {
  if (params.swapAmount <= 0n || params.rewardMint === params.assetMint) {
    return undefined;
  }

  const quoteUrl =
    `${JUPITER_SWAP_API_BASE}/quote?inputMint=${params.rewardMint}` +
    `&outputMint=${params.assetMint}` +
    `&amount=${params.swapAmount.toString()}` +
    `&slippageBps=${params.slippageBps}` +
    `&maxAccounts=${params.maxAccounts}`;

  const quoteResponse = (await (await fetch(quoteUrl)).json()) as { error?: string };
  if (quoteResponse.error) {
    throw new Error(`Jupiter quote failed: ${quoteResponse.error}`);
  }

  const swapResponse = (await (
    await fetch(`${JUPITER_SWAP_API_BASE}/swap-instructions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quoteResponse, userPublicKey: params.authority }),
    })
  ).json()) as {
    error?: string;
    swapInstruction: {
      programId: string;
      accounts: { pubkey: string; isWritable: boolean }[];
      data: string;
    };
    addressLookupTableAddresses: string[];
  };
  if (swapResponse.error) {
    throw new Error(`Jupiter swap-instructions failed: ${swapResponse.error}`);
  }

  const { swapInstruction, addressLookupTableAddresses } = swapResponse;
  return {
    swapInstructionData: new Uint8Array(Buffer.from(swapInstruction.data, "base64")),
    swapAccounts: [
      readonlyAccount(address(swapInstruction.programId)),
      ...swapInstruction.accounts.map((account) =>
        account.isWritable
          ? writableAccount(address(account.pubkey))
          : readonlyAccount(address(account.pubkey))
      ),
    ],
    lookupTableAddresses: addressLookupTableAddresses.map((value) => address(value)),
  };
}

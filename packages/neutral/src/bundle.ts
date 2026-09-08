import {
  type Address,
  type Decoder,
  type ReadonlyUint8Array,
} from "@solana/kit";
import { TOKEN_PROGRAM_ADDRESS, getTokenDecoder } from "@solana-program/token";
import { VOLTR_VAULT_PROGRAM_ADDRESS } from "@voltr/vault-sdk";
import type { ScriptContext } from "@voltr/scripts-core";
import {
  BUNDLE_DISCRIMINATOR,
  getBundleDecoder,
  type Bundle,
} from "./generated/accounts/bundle.js";
import {
  USER_BUNDLE_ACCOUNT_DISCRIMINATOR,
  getUserBundleAccountDecoder,
  type UserBundleAccount,
} from "./generated/accounts/userBundleAccount.js";
import {
  STRATEGY_INIT_RECEIPT_DISCRIMINATOR,
  getStrategyInitReceiptDecoder,
  type StrategyInitReceipt,
} from "./generated-vault/accounts/strategyInitReceipt.js";
import {
  NTBUNDLE_PROGRAM_ID,
  NEUTRAL_ADAPTOR_PROGRAM_ID,
} from "./constants.js";
import {
  deriveNeutralBundleAccounts,
  type NeutralBundleAccounts,
} from "./pda.js";

async function readAccount<T>(
  context: ScriptContext,
  account: Address,
  owner: Address,
  decoder: Decoder<T>,
  discriminator?: ReadonlyUint8Array
): Promise<T | null> {
  const { value } = await context.rpc
    .getAccountInfo(account, { encoding: "base64", commitment: "confirmed" })
    .send();
  if (!value) return null;
  if (value.owner !== owner || value.executable)
    throw new Error(`Invalid account owner or executable flag: ${account}`);
  const data = Buffer.from(value.data[0], "base64");
  if (
    discriminator &&
    !Buffer.from(discriminator).equals(data.subarray(0, discriminator.length))
  )
    throw new Error(`Invalid account discriminator: ${account}`);
  try {
    return decoder.decode(data);
  } catch {
    throw new Error(`Invalid account data: ${account}`);
  }
}

export interface NeutralBundleAddressArgs {
  vault: Address;
  bundle: Address;
  assetMint: Address;
  assetTokenProgram: Address;
}

export async function loadNeutralBundle(
  context: ScriptContext,
  args: NeutralBundleAddressArgs
): Promise<Bundle> {
  if (args.assetTokenProgram !== TOKEN_PROGRAM_ADDRESS)
    throw new Error("Neutral bundles require the Classic Token Program");
  const bundle = await readAccount(
    context,
    args.bundle,
    NTBUNDLE_PROGRAM_ID,
    getBundleDecoder(),
    BUNDLE_DISCRIMINATOR
  );
  if (!bundle) throw new Error(`Neutral bundle not found: ${args.bundle}`);
  if (bundle.assetAddress !== args.assetMint)
    throw new Error("Profile asset mint does not match the Neutral bundle");
  return bundle;
}

interface NeutralBundlePosition {
  bundle: Bundle;
  accounts: NeutralBundleAccounts;
  user: UserBundleAccount | null;
  receipt: StrategyInitReceipt | null;
  strategyAtaAmount: bigint;
}

export async function loadNeutralBundlePosition(
  context: ScriptContext,
  args: NeutralBundleAddressArgs
): Promise<NeutralBundlePosition> {
  const bundle = await loadNeutralBundle(context, args);
  const accounts = await deriveNeutralBundleAccounts(
    args.vault,
    args.bundle,
    args.assetMint
  );
  const [user, receipt, token] = await Promise.all([
    readAccount(
      context,
      accounts.userBundleAccount,
      NTBUNDLE_PROGRAM_ID,
      getUserBundleAccountDecoder(),
      USER_BUNDLE_ACCOUNT_DISCRIMINATOR
    ),
    readAccount(
      context,
      accounts.strategyInitReceipt,
      VOLTR_VAULT_PROGRAM_ADDRESS,
      getStrategyInitReceiptDecoder(),
      STRATEGY_INIT_RECEIPT_DISCRIMINATOR
    ),
    readAccount(
      context,
      accounts.vaultStrategyAssetAta,
      TOKEN_PROGRAM_ADDRESS,
      getTokenDecoder()
    ),
  ]);
  if (user && user.owner !== accounts.vaultStrategyAuth)
    throw new Error(
      "Neutral depositor owner does not match the vault strategy authority"
    );
  if (
    receipt &&
    (receipt.vault !== args.vault ||
      receipt.strategy !== args.bundle ||
      receipt.adaptorProgram !== NEUTRAL_ADAPTOR_PROGRAM_ID)
  )
    throw new Error("Strategy receipt does not match this Neutral strategy");
  if (
    token &&
    (token.owner !== accounts.vaultStrategyAuth ||
      token.mint !== args.assetMint)
  )
    throw new Error("Strategy token account has an invalid owner or mint");
  return {
    bundle,
    accounts,
    user,
    receipt,
    strategyAtaAmount: token?.amount ?? 0n,
  };
}

export function assertNeutralAccountingVersion(
  receipt: { version: number } | null
): void {
  if (receipt && receipt.version !== 2)
    throw new Error(
      "Neutral requires a version-2 strategy receipt. Migrate legacy accounting before operating this strategy."
    );
}

import "dotenv/config";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  address,
  createKeyPairSignerFromBytes,
  createSolanaRpc,
  type Address,
  type KeyPairSigner,
} from "@solana/kit";
import type { ScriptContext, ScriptProfile } from "./types.js";

export async function loadProfile(profilePath: string): Promise<ScriptProfile> {
  const resolvedPath = resolve(profilePath);
  const raw = await readFile(resolvedPath, "utf8");
  const profile = JSON.parse(raw) as ScriptProfile;

  if (!profile.name) {
    throw new Error(`Profile ${resolvedPath} is missing "name"`);
  }
  if (!profile.cluster) {
    throw new Error(`Profile ${resolvedPath} is missing "cluster"`);
  }
  if (!profile.vault) {
    throw new Error(`Profile ${resolvedPath} is missing "vault"`);
  }

  return profile;
}

export function createScriptContext(
  profile: ScriptProfile,
  rpcUrlOverride?: string
): ScriptContext {
  const rpcUrl =
    rpcUrlOverride ||
    process.env.RPC_URL ||
    process.env.HELIUS_RPC_URL ||
    profile.rpcUrl;

  if (!rpcUrl) {
    throw new Error(
      "RPC URL is required. Set RPC_URL, HELIUS_RPC_URL, profile.rpcUrl, or pass --rpc-url."
    );
  }

  return {
    profile,
    rpcUrl,
    rpc: createSolanaRpc(rpcUrl),
  };
}

export async function loadSignerFromFile(
  keypairPath: string
): Promise<KeyPairSigner> {
  const secret = Uint8Array.from(
    JSON.parse(await readFile(resolve(keypairPath), "utf8"))
  );
  return createKeyPairSignerFromBytes(secret);
}

export function asAddress(value: string, label = "address"): Address {
  if (!value) {
    throw new Error(`${label} is required`);
  }
  return address(value);
}

export function optionalAddress(value?: string): Address | undefined {
  return value ? address(value) : undefined;
}

export function parseBigintAmount(value: string | number | bigint): bigint {
  if (typeof value === "bigint") {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isInteger(value)) {
      throw new Error(`Amount must be an integer: ${value}`);
    }
    return BigInt(value);
  }
  if (!/^\d+$/.test(value)) {
    throw new Error(`Amount must be a raw integer string: ${value}`);
  }
  return BigInt(value);
}


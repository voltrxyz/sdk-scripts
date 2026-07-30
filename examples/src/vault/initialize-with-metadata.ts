/**
 * vault:initialize-with-metadata — initialize a new Voltr vault with LP token
 * metadata and inspect the operation.
 *
 * Run:   pnpm exec tsx examples/src/vault/initialize-with-metadata.ts   (or: pnpm example -- vault:initialize-with-metadata)
 * Needs: profile vault.assetMintAddress + vault.assetTokenProgram; ADMIN_KEYPAIR.
 *        A fresh vault keypair is generated and its address printed — record it
 *        as vault.vaultAddress afterwards. Builds offline (print needs no RPC).
 * Mode:  defaults to print (--mode execute / VOLTR_MODE=execute to send).
 */
import {
  address,
  buildInitVaultWithMetadataOperation,
  generateKeyPairSigner,
  requireAssetMint,
  requireAssetTokenProgram,
  resolveLookupTableAddresses,
  type LpTokenMetadata,
  type VaultInitConfig,
} from "@voltr/scripts-core";
import { defineExample, runIfMain } from "../shared/harness.js";

// --- edit for your run ---
const MANAGER = address("So11111111111111111111111111111111111111112"); // strategy-allocation authority
const VAULT_NAME = "Example Vault";
const MAX_CAP = 1_000_000_000_000n; // max deposit cap, asset smallest units
const LP_TOKEN_METADATA: LpTokenMetadata = {
  name: "Example Vault LP",
  symbol: "EVLP",
  uri: "https://example.com/voltr-vault-lp.json",
};
// -------------------------

// Fees, durations, and the start timestamp default to 0 here; set them
// deliberately for a real deployment.
const CONFIG: VaultInitConfig = {
  maxCap: MAX_CAP,
  startAtTs: 0n,
  managerPerformanceFee: 0,
  adminPerformanceFee: 0,
  managerManagementFee: 0,
  adminManagementFee: 0,
  lockedProfitDegradationDuration: 0n,
  redemptionFee: 0,
  issuanceFee: 0,
  withdrawalWaitingPeriod: 0n,
};

const example = defineExample("vault:initialize-with-metadata", async (h) => {
  const admin = await h.signer("admin");
  // The vault account is a fresh keypair the caller owns; it must sign init.
  const vault = await generateKeyPairSigner();

  const operation = await buildInitVaultWithMetadataOperation(h.ctx, {
    admin,
    manager: MANAGER,
    vault,
    assetMint: requireAssetMint(h.profile),
    assetTokenProgram: requireAssetTokenProgram(h.profile),
    config: CONFIG,
    name: VAULT_NAME,
    description: "",
    lookupTableAddresses: resolveLookupTableAddresses(h.profile),
    lpTokenMetadata: LP_TOKEN_METADATA,
  });

  await h.process(operation, admin);
  h.line();
  h.field("generated vault", vault.address);
  h.note("Record this as vault.vaultAddress in your profile after a successful execute run.");
});

export default example;

await runIfMain(import.meta.url, example);

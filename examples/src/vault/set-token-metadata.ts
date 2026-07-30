/**
 * vault:set-token-metadata — create LP token metadata for an already-initialized
 * vault.
 *
 * Run:   pnpm exec tsx examples/src/vault/set-token-metadata.ts   (or: pnpm example -- vault:set-token-metadata)
 * Needs: profile vault.vaultAddress; ADMIN_KEYPAIR.
 * Mode:  defaults to print (--mode execute / VOLTR_MODE=execute to send).
 */
import {
  buildSetTokenMetadataOperation,
  requireVaultAddress,
  type LpTokenMetadata,
} from "@voltr/scripts-core";
import { defineExample, runIfMain } from "../shared/harness.js";

// --- edit for your run ---
const LP_TOKEN_METADATA: LpTokenMetadata = {
  name: "Example Vault LP",
  symbol: "EVLP",
  uri: "https://example.com/voltr-vault-lp.json",
};
// -------------------------

const example = defineExample("vault:set-token-metadata", async (h) => {
  const admin = await h.signer("admin");
  const operation = await buildSetTokenMetadataOperation(h.ctx, {
    admin,
    vault: requireVaultAddress(h.profile),
    lpTokenMetadata: LP_TOKEN_METADATA,
  });
  await h.process(operation, admin);
});

export default example;

await runIfMain(import.meta.url, example);

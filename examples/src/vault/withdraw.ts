/**
 * vault:withdraw — claim a previously requested withdrawal.
 *
 * Run vault/request-withdraw.ts first; the on-chain program throws if no request
 * is outstanding.
 *
 * Run:   pnpm exec tsx examples/src/vault/withdraw.ts   (or: pnpm example -- vault:withdraw)
 * Needs: profile vault.vaultAddress + asset fields; USER_KEYPAIR.
 * Mode:  defaults to print (--mode execute / VOLTR_MODE=execute to send).
 */
import {
  buildWithdrawVaultOperation,
  requireAssetMint,
  requireAssetTokenProgram,
  requireVaultAddress,
  resolveLookupTableAddresses,
} from "@voltr/scripts-core";
import { defineExample, runIfMain } from "../shared/harness.js";

const example = defineExample("vault:withdraw", async (h) => {
  const user = await h.signer("user");
  const operation = await buildWithdrawVaultOperation(h.ctx, {
    user,
    vault: requireVaultAddress(h.profile),
    assetMint: requireAssetMint(h.profile),
    assetTokenProgram: requireAssetTokenProgram(h.profile),
    lookupTableAddresses: resolveLookupTableAddresses(h.profile),
  });
  await h.process(operation, user);
});

export default example;

await runIfMain(import.meta.url, example);

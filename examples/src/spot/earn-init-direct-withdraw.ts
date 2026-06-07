/**
 * spot:earn-init-direct-withdraw — register the Jupiter Earn strategy as a
 * direct-withdraw strategy on the vault. The strategy (Jupiter lending PDA) and
 * Spot adaptor program are derived; the 8-byte discriminator comes from the
 * profile. The admin signs.
 *
 * Run:   pnpm exec tsx examples/src/spot/earn-init-direct-withdraw.ts   (or: pnpm example -- spot:earn-init-direct-withdraw)
 * Needs: profile vault.* + integrations.spot.directWithdrawDiscriminator;
 *        ADMIN_KEYPAIR.
 * Mode:  defaults to print (--mode execute / VOLTR_MODE=execute to send).
 */
import { buildSpotEarnInitDirectWithdrawOperation } from "@voltr/scripts-spot";
import {
  requireAssetMint,
  requireSpotDirectWithdrawDiscriminator,
  requireVaultAddress,
  resolveLookupTableAddresses,
} from "@voltr/scripts-core";
import { defineExample, runIfMain } from "../shared/harness.js";

const example = defineExample("spot:earn-init-direct-withdraw", async (h) => {
  const admin = await h.signer("admin");
  const operation = await buildSpotEarnInitDirectWithdrawOperation(h.ctx, {
    admin,
    vault: requireVaultAddress(h.profile),
    assetMint: requireAssetMint(h.profile),
    instructionDiscriminator: requireSpotDirectWithdrawDiscriminator(h.profile),
    lookupTableAddresses: resolveLookupTableAddresses(h.profile),
  });
  await h.process(operation, admin);
});

export default example;

await runIfMain(import.meta.url, example);

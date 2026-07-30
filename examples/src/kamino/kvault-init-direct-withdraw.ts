/**
 * kamino:kvault-init-direct-withdraw — register the Kamino vault (kvault) as a
 * direct-withdraw strategy on the vault. Kamino calls the generic core builder
 * directly with strategy = kvault. The admin signs.
 *
 * Run:   pnpm exec tsx examples/src/kamino/kvault-init-direct-withdraw.ts
 *        (or: pnpm example -- kamino:kvault-init-direct-withdraw)
 * Needs: profile vault.* + integrations.kamino.kvaultAddress +
 *        integrations.kamino.directWithdrawDiscriminator; ADMIN_KEYPAIR.
 * Mode:  defaults to print (--mode execute / VOLTR_MODE=execute to send).
 */
import { KAMINO_ADAPTOR_PROGRAM_ID } from "@voltr/scripts-kamino";
import {
  buildInitDirectWithdrawStrategyOperation,
  requireKaminoDirectWithdrawDiscriminator,
  requireKaminoKvault,
  requireVaultAddress,
  resolveLookupTableAddresses,
} from "@voltr/scripts-core";
import { defineExample, runIfMain } from "../shared/harness.js";

const example = defineExample(
  "kamino:kvault-init-direct-withdraw",
  async (h) => {
    const admin = await h.signer("admin");
    const operation = await buildInitDirectWithdrawStrategyOperation(h.ctx, {
      admin,
      vault: requireVaultAddress(h.profile),
      strategy: requireKaminoKvault(h.profile),
      adaptorProgram: KAMINO_ADAPTOR_PROGRAM_ID,
      instructionDiscriminator: requireKaminoDirectWithdrawDiscriminator(
        h.profile
      ),
      lookupTableAddresses: resolveLookupTableAddresses(h.profile),
    });
    await h.process(operation, admin);
  }
);

export default example;

await runIfMain(import.meta.url, example);

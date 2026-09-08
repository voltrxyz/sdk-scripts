import {
  buildNeutralBundleRequestWithdrawOperation,
  U64_MAX,
} from "@voltr/scripts-neutral";
import {
  requireVaultAddress,
  requireAssetMint,
  requireAssetTokenProgram,
  requireNeutralBundle,
  resolveLookupTableAddresses,
} from "@voltr/scripts-core";
import { defineExample, runIfMain } from "../shared/harness.js";

const example = defineExample("neutral:bundle-request-withdraw", async (h) => {
  const manager = await h.signer("manager");
  const operation = await buildNeutralBundleRequestWithdrawOperation(h.ctx, {
    manager,
    vault: requireVaultAddress(h.profile),
    bundle: requireNeutralBundle(h.profile),
    assetMint: requireAssetMint(h.profile),
    assetTokenProgram: requireAssetTokenProgram(h.profile),
    lookupTableAddresses: resolveLookupTableAddresses(h.profile),
    amount: U64_MAX,
  });
  await h.process(operation, manager);
});
export default example;
await runIfMain(import.meta.url, example);

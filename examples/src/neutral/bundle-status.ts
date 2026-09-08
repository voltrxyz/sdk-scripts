import { queryNeutralBundleStatus } from "@voltr/scripts-neutral";
import {
  requireVaultAddress,
  requireAssetMint,
  requireAssetTokenProgram,
  requireNeutralBundle,
} from "@voltr/scripts-core";
import { defineExample, runIfMain } from "../shared/harness.js";
const example = defineExample("neutral:bundle-status", async (h) => {
  console.log(
    JSON.stringify(
      await queryNeutralBundleStatus(h.ctx, {
        vault: requireVaultAddress(h.profile),
        bundle: requireNeutralBundle(h.profile),
        assetMint: requireAssetMint(h.profile),
        assetTokenProgram: requireAssetTokenProgram(h.profile),
      }),
      null,
      2
    )
  );
});
export default example;
await runIfMain(import.meta.url, example);

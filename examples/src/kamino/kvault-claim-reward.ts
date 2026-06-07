/**
 * kamino:kvault-claim-reward — claim a Kamino vault farm reward into the vault
 * asset, optionally swapping the reward via Jupiter.
 *
 * Each run handles ONE already-resolved farm/reward (set the constants below;
 * resolve the farm via the Kamino farms SDK / UI). Leave SWAP_AMOUNT at 0n to
 * claim without a swap.
 *
 * Run:   pnpm exec tsx examples/src/kamino/kvault-claim-reward.ts   (or: pnpm example -- kamino:kvault-claim-reward)
 * Needs: profile vault.* + integrations.kamino.kvaultAddress; MANAGER_KEYPAIR.
 *        Decodes the on-chain kvault (and calls Jupiter when SWAP_AMOUNT > 0).
 * Mode:  defaults to print (--mode execute / VOLTR_MODE=execute to send).
 */
import { buildKaminoKvaultClaimRewardOperation } from "@voltr/scripts-kamino";
import {
  address,
  findVaultStrategyAuthPda,
  requireAssetMint,
  requireAssetTokenProgram,
  requireKaminoKvault,
  requireVaultAddress,
  resolveLookupTableAddresses,
} from "@voltr/scripts-core";
import { defineExample, runIfMain } from "../shared/harness.js";
import { setupRewardSwap } from "../shared/jupiter.js";

// --- edit for your run ---
const REWARD_MINT = address("So11111111111111111111111111111111111111112");
const REWARD_TOKEN_PROGRAM = address("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const FARM_STATE = address("So11111111111111111111111111111111111111112");
const USER_STATE = address("So11111111111111111111111111111111111111112");
const REWARD_INDEX: number | undefined = undefined; // set a number for a specific reward slot
const SWAP_AMOUNT = 0n; // raw reward to swap into the asset via Jupiter (0n = no swap)
const SLIPPAGE_BPS = 50;
const JUPITER_MAX_ACCOUNTS = 18;
// -------------------------

const example = defineExample("kamino:kvault-claim-reward", async (h) => {
  const manager = await h.signer("manager");
  const vault = requireVaultAddress(h.profile);
  const assetMint = requireAssetMint(h.profile);
  const kvault = requireKaminoKvault(h.profile);

  const [authority] = await findVaultStrategyAuthPda({ vault, strategy: kvault });
  const jupiterSwap = await setupRewardSwap({
    rewardMint: REWARD_MINT,
    assetMint,
    swapAmount: SWAP_AMOUNT,
    authority,
    slippageBps: SLIPPAGE_BPS,
    maxAccounts: JUPITER_MAX_ACCOUNTS,
  });

  const operation = await buildKaminoKvaultClaimRewardOperation(h.ctx, {
    manager,
    vault,
    assetMint,
    assetTokenProgram: requireAssetTokenProgram(h.profile),
    kvault,
    rewardMint: REWARD_MINT,
    rewardTokenProgram: REWARD_TOKEN_PROGRAM,
    farmState: FARM_STATE,
    userState: USER_STATE,
    rewardIndex: REWARD_INDEX,
    jupiterSwap,
    lookupTableAddresses: resolveLookupTableAddresses(h.profile),
  });
  await h.process(operation, manager);
});

export default example;

await runIfMain(import.meta.url, example);

# Script Parity Matrix

The single source of truth for **old-to-new parity**: every script in the four
legacy fork-per-integration repos, mapped to the operation builder and CLI
command that now replaces it, with a migration status and notes on any behavior
difference.

For the runnable command examples, profile setup, transaction modes, and the
step-by-step flows, see **[migration-recipes.md](./migration-recipes.md)**. For
the per-adapter deep dives, see [kamino-migration.md](./kamino-migration.md),
[spot-migration.md](./spot-migration.md),
[adaptor-admin.md](./adaptor-admin.md), and
[packages/trustful/MIGRATION.md](../packages/trustful/MIGRATION.md). The overall
package shape is in [architecture.md](./architecture.md).

Legacy repos (read-only migration references — do not edit for ongoing ops):

- `/Users/shayn/Desktop/voltr/voltr-base-scripts`
- `/Users/shayn/Desktop/voltr/voltr-kamino-scripts`
- `/Users/shayn/Desktop/voltr/voltr-spot-scripts`
- `/Users/shayn/Desktop/voltr/voltr-trustful-scripts`

## How the forks overlap

Each of the four legacy repos was a **fork** that carried the same 13 base vault
scripts (`src/scripts/admin-*-vault*`, `user-*-vault`, `*-query-*`) plus its own
adapter-specific scripts. The base scripts are byte-for-byte identical across
forks except for the constants they import, so they are listed **once** in
[§A](#a-shared-base-vault-scripts-all-four-forks). Scripts that exist in more
than one fork (the adaptor-admin scripts) are listed once in
[§B](#b-adaptor-administration-scripts). Adapter-specific scripts are listed in
their adapter's section.

### Coverage by repo (audit)

Every script file in every repo is accounted for below. Shared files are counted
once, in the lowest-numbered section that covers them.

| Legacy repo | Script files | Covered by |
| --- | --- | --- |
| `voltr-base-scripts` | 13 | §A (13) |
| `voltr-kamino-scripts` | 27 | §A (13) + §B (`add-adaptor`, `init-direct-withdraw`) + §C (12) |
| `voltr-spot-scripts` | 21 | §A (13; `query-strategy-positions` enriched in §D) + §B (`add-adaptor`, `init-direct-withdraw`) + §D (6) |
| `voltr-trustful-scripts` | 22 | §A (13) + §B (`add-adaptor`, `remove-adaptor`) + §E (7) |

## Status legend

| Status | Meaning |
| --- | --- |
| ✅ Migrated | Behavior preserved; one builder + one CLI command replace the script. |
| ✅ Migrated \* | Migrated, but with a documented behavior change or bug fix — see [Behavior differences](#behavior-differences-and-deferrals). |
| 🟡 Follow-up | The operation is migrated, but a secondary step the legacy script did (the optional LUT-extend transaction) is **not yet** wired as a command. See [Behavior differences](#behavior-differences-and-deferrals). |

No script was dropped: every legacy script maps to a builder and a command.
The only *intentionally deferred* behavior is the multi-transaction LUT
create/extend that some `init`/admin scripts performed as extra transactions —
deferred by design (one builder = one operation) and detailed at the end.

## A. Shared base vault scripts (all four forks)

`@voltr/scripts-core`, files `vault/operations.ts`, `vault/admin.ts`,
`vault/queries.ts`. The two `vault:query:*` commands are read-only (no `--mode`,
no keypair); the rest honor `--mode`.

| Legacy script (`src/scripts/`) | Builder / query (`@voltr/scripts-core`) | CLI command | Status | Notes |
| --- | --- | --- | --- | --- |
| `admin-init-vault.ts` | `buildInitVaultOperation` | `vault:init` | 🟡 Follow-up | Vault-init tx preserved. The optional **LUT create + extend** the script ran afterwards is deferred (see [LUT extend](#optional-lut-extend-deferred)). A fresh vault keypair is generated and printed; record it as `vault.vaultAddress`. `--mode multisig` rejected (ephemeral keypair must sign). |
| `admin-init-vault-and-set-token-metadata.ts` | `buildInitVaultWithMetadataOperation` | `vault:init-and-set-token-metadata` | 🟡 Follow-up | Same as `vault:init` plus LP-token metadata in one tx. |
| `admin-set-token-metadata.ts` | `buildSetTokenMetadataOperation` | `vault:set-token-metadata` | ✅ Migrated | |
| `admin-update-vault-config.ts` | `buildUpdateVaultConfigOperation` | `vault:update-config` | ✅ Migrated | One field per call (`--field` + `--value`); value encoding is field-dependent (`serializeVaultConfigValue`). Legacy edited `config/base.ts`. |
| `admin-accept-vault-admin.ts` | `buildAcceptVaultAdminOperation` | `vault:accept-admin` | ✅ Migrated | Pending-admin accepts the transfer. |
| `admin-harvest-fee.ts` | `buildHarvestFeeOperation` | `vault:harvest-fee` | ✅ Migrated | `--manager <address>`; protocol fee recipient is a fixed core constant, no longer a per-script value. |
| `user-deposit-vault.ts` | `buildDepositVaultOperation` | `vault:deposit` | ✅ Migrated | |
| `user-request-withdraw-vault.ts` | `buildRequestWithdrawVaultOperation` | `vault:request-withdraw` | ✅ Migrated | `--in-lp` (LP-token amount), `--all` (whole position). |
| `user-cancel-request-withdraw-vault.ts` | `buildCancelRequestWithdrawVaultOperation` | `vault:cancel-request-withdraw` | ✅ Migrated | |
| `user-withdraw-vault.ts` | `buildWithdrawVaultOperation` | `vault:withdraw` | ✅ Migrated | Claims a previously requested withdraw after the waiting period. |
| `user-instant-withdraw-vault.ts` | `buildInstantWithdrawVaultOperation` | `vault:instant-withdraw` | ✅ Migrated | `--in-lp`, `--all`. |
| `user-query-position.ts` | `queryVaultPosition` (query) | `vault:query:position` | ✅ Migrated | Read-only; `--user <address>`. |
| `query-strategy-positions.ts` | `queryStrategyPositions` (query) | `vault:query:strategy-positions` | ✅ Migrated | Read-only. **Spot fork's copy is superseded** by the enriched `spot:query:strategy-positions` (§D). |

## B. Adaptor administration scripts

Generic core builders parameterized by `adaptorProgram` — the three forks'
`admin-add-adaptor.ts` are identical except for the program-id constant, so they
collapse to one command. `@voltr/scripts-core`, file `vault/adaptor.ts` (Spot's
direct-withdraw uses a thin `packages/spot` wrapper that derives the strategy
PDA). See [adaptor-admin.md](./adaptor-admin.md).

| Legacy script | Found in forks | Builder | CLI command | Status | Notes |
| --- | --- | --- | --- | --- | --- |
| `admin-add-adaptor.ts` | Kamino, Spot, Trustful | `buildAddAdaptorOperation` | `vault:add-adaptor` | 🟡 Follow-up | Defaults to the Kamino adaptor; pass `--adaptor-program` for Spot/Trustful. Optional LUT-extend deferred. |
| `admin-remove-adaptor.ts` | Trustful | `buildRemoveAdaptorOperation` | `vault:remove-adaptor` | ✅ Migrated | |
| `admin-init-direct-withdraw.ts` | Kamino | `buildInitDirectWithdrawStrategyOperation` | `vault:init-direct-withdraw` | 🟡 Follow-up | Strategy defaults to the profile Kamino kvault; discriminator from `integrations.kamino.directWithdrawDiscriminator` (or `--discriminator` when overriding `--adaptor-program`). Optional LUT-extend deferred. |
| `admin-init-direct-withdraw.ts` | Spot | `buildSpotEarnInitDirectWithdrawOperation` → core | `spot:earn:init-direct-withdraw` | ✅ Migrated | Spot-specific wrapper derives the Jupiter `lending` strategy PDA, then delegates to the core builder. Reads `integrations.spot.directWithdrawDiscriminator`. |

## C. Kamino-specific scripts (`voltr-kamino-scripts`)

`@voltr/scripts-kamino`, files `operations/market.ts`, `operations/kvault.ts`.
Reserve from `integrations.kamino.reserveAddress`, kvault from
`integrations.kamino.kvaultAddress`. Manager-signed except the two user
direct-withdraw flows. See [kamino-migration.md](./kamino-migration.md).

| Legacy script (`src/scripts/`) | Builder | CLI command | Status | Notes |
| --- | --- | --- | --- | --- |
| `manager-initialize-market.ts` | `buildKaminoMarketInitOperation` | `kamino:market:init` | ✅ Migrated | |
| `manager-deposit-market.ts` | `buildKaminoMarketDepositOperation` | `kamino:market:deposit` | ✅ Migrated | |
| `manager-withdraw-market.ts` | `buildKaminoMarketWithdrawOperation` | `kamino:market:withdraw` | ✅ Migrated | |
| `manager-claim-market-reward.ts` | `buildKaminoMarketClaimRewardOperation` | `kamino:market:claim-reward` | ✅ Migrated \* | One **already-resolved** farm/reward per call (operator passes `--farm-state`/`--user-state`/`--reward-mint`); legacy looped all farms. See [Claim-reward scope](#claim-reward-farm-discovery-is-operator-supplied). |
| `manager-claim-market-reward-with-index.ts` | `buildKaminoMarketClaimRewardOperation` (`--reward-index`) | `kamino:market:claim-reward-with-index` | ✅ Migrated | Same builder; `--reward-index` adds the `*_WITH_INDEX` discriminator. |
| `manager-initialize-kvault.ts` | `buildKaminoKvaultInitOperation` | `kamino:kvault:init` | ✅ Migrated | |
| `manager-deposit-kvault.ts` | `buildKaminoKvaultDepositOperation` | `kamino:kvault:deposit` | ✅ Migrated | Appends the vault's own LUT (from `VaultState`). |
| `manager-withdraw-kvault.ts` | `buildKaminoKvaultWithdrawOperation` | `kamino:kvault:withdraw` | ✅ Migrated | |
| `manager-claim-kvault-rewards.ts` | `buildKaminoKvaultClaimRewardOperation` | `kamino:kvault:claim-reward` | ✅ Migrated \* | Same farm-discovery note as the market claim. |
| `manager-claim-kvault-rewards-with-index.ts` | `buildKaminoKvaultClaimRewardOperation` (`--reward-index`) | `kamino:kvault:claim-reward-with-index` | ✅ Migrated | |
| `user-direct-withdraw-strategy.ts` | `buildKaminoKvaultDirectWithdrawOperation` | `kamino:kvault:direct-withdraw` | ✅ Migrated | User-signed; grouped under `kvault` (acts on the kvault strategy). |
| `user-request-and-direct-withdraw-strategy.ts` | `buildKaminoKvaultRequestAndDirectWithdrawOperation` | `kamino:kvault:request-and-direct-withdraw` | ✅ Migrated | User-signed; `--amount`, optional `--in-lp`/`--all`. |

## D. Spot-specific scripts (`voltr-spot-scripts`)

`@voltr/scripts-spot`, files `operations/swap.ts`, `operations/earn.ts`,
`queries/strategy-positions.ts`. Foreign mint / token program / both Pyth
oracles from `integrations.spot.*`. Manager-signed except the read-only query.
See [spot-migration.md](./spot-migration.md).

| Legacy script (`src/scripts/`) | Builder / query | CLI command | Status | Notes |
| --- | --- | --- | --- | --- |
| `manager-initialize-spot.ts` | `buildSpotSwapInitOperation` | `spot:swap:init` | ✅ Migrated | |
| `manager-buy-spot.ts` | `buildSpotSwapBuyOperation` | `spot:swap:buy` | ✅ Migrated | Asset → foreign swap via the Jupiter API. |
| `manager-sell-spot.ts` | `buildSpotSwapSellOperation` | `spot:swap:sell` | ✅ Migrated \* | **Bug fix.** Legacy passed `amountIn = 0` (wrong direction) and never built a swap. New builder does the intended foreign → asset swap of `--amount`. See [Behavior differences](#spotswapsell-fixes-a-no-op-swap). |
| `manager-initialize-earn.ts` (tx 1) | `buildSpotEarnInitOperation` | `spot:earn:init` | ✅ Migrated | Init transaction only. |
| `manager-initialize-earn.ts` (tx 2) | `buildSpotEarnExtendLutOperation` | `spot:earn:extend-lut` | ✅ Migrated | The legacy second tx (LUT extend) **is** exposed as its own command; run it after `spot:earn:init` when you use a LUT. |
| `manager-deposit-earn.ts` | `buildSpotEarnDepositOperation` | `spot:earn:deposit` | ✅ Migrated | |
| `manager-withdraw-earn.ts` | `buildSpotEarnWithdrawOperation` | `spot:earn:withdraw` | ✅ Migrated | |
| `query-strategy-positions.ts` (Spot fork) | `querySpotStrategyPositions` | `spot:query:strategy-positions` | ✅ Migrated \* | Shared base file (§A), **enriched** here: augments each strategy's value with its current raw foreign-token balance where available. |

## E. Trustful-specific scripts (`voltr-trustful-scripts`)

`@voltr/scripts-trustful`, files `operations/arbitrary.ts`,
`operations/curve.ts`. Arbitrary strategy named by
`integrations.trustful.strategySeedString`; curve is a per-vault singleton
seeded by the fixed `"curve"` constant. All manager-signed. See
[packages/trustful/MIGRATION.md](../packages/trustful/MIGRATION.md).

| Legacy script (`src/scripts/`) | Builder | CLI command | Status | Notes |
| --- | --- | --- | --- | --- |
| `manager-initialize-arbitrary.ts` | `buildTrustfulArbitraryInitOperation` | `trustful:arbitrary:init` | ✅ Migrated | Sets up the vault-strategy ATA, then `initialize_strategy`. |
| `manager-deposit-arbitrary.ts` | `buildTrustfulArbitraryDepositOperation` | `trustful:arbitrary:deposit` | ✅ Migrated | `--destination`, `--position-value-after`. Prints the **withdrawal-holding account** (legacy `console.log`, preserved as operation metadata) — return assets there before withdrawing. |
| `manager-withdraw-arbitrary.ts` | `buildTrustfulArbitraryWithdrawOperation` | `trustful:arbitrary:withdraw` | ✅ Migrated | `--position-value-after`. |
| `manager-initialize-curve.ts` | `buildTrustfulCurveInitOperation` | `trustful:curve:init` | 🟡 Follow-up | Sets up holding/vault-strategy/manager ATAs, then `initialize_strategy`. The legacy LUT-extend second tx is **not** bundled (see [LUT extend](#optional-lut-extend-deferred)). |
| `manager-borrow-curve.ts` | `buildTrustfulCurveBorrowOperation` | `trustful:curve:borrow` | ✅ Migrated | `--amount`, `--borrow-rate-bps`. |
| `manager-repay-curve.ts` | `buildTrustfulCurveRepayOperation` | `trustful:curve:repay` | ✅ Migrated \* | **Correctness fix.** Legacy derived the curve strategy from `strategySeedString` (only correct when it happened to equal `"curve"`); all curve builders now derive from the fixed `"curve"` seed. See [Behavior differences](#trustfulcurverepay-corrects-the-strategy-seed). |
| `manager-remove-curve.ts` | `buildTrustfulCurveRemoveOperation` | `trustful:curve:remove` | ✅ Migrated | `close_strategy`. |

## New, split, and unified commands

Only one command is genuinely **new with no legacy script**:

- `check` — validate a profile and print a config summary. Fully offline (the
  only command that needs no RPC). No legacy equivalent.

The following commands **do** trace back to legacy scripts (mapped above), but
not one-to-one — noted here so the mapping isn't mistaken for "brand new":

- `spot:earn:extend-lut` — the second (LUT-extend) transaction of
  `manager-initialize-earn.ts`, split into its own command (§D).
- `vault:add-adaptor` / `vault:remove-adaptor` / `vault:init-direct-withdraw` —
  their builders migrate the per-fork adaptor-admin scripts (§B), but they are
  exposed as one adapter-agnostic, parameterized command set that no single fork
  had as a unified surface.

## Behavior differences and deferrals

### `spot:swap:sell` fixes a no-op swap

The legacy `manager-sell-spot.ts` passed `amountIn = 0` and the asset→foreign
direction to its Jupiter helper, so it never actually built a swap.
`buildSpotSwapSellOperation` implements the intended behavior — a foreign→asset
swap of `--amount`, symmetric with `spot:swap:buy`. Operators relying on the old
script's (broken) behavior will now get a real sell; verify with `--mode
simulate` first.

### `trustful:curve:repay` corrects the strategy seed

`initialize`/`borrow`/`remove` derived the curve strategy from the fixed
`"curve"` seed, but the legacy `manager-repay-curve.ts` derived it from the
arbitrary `strategySeedString` — only correct when that string happened to be
`"curve"`. All curve commands now use the `"curve"` constant, matching the
adaptor's own `transfer_curve`, so repay can no longer desync from init/borrow.

### Claim-reward farm discovery is operator-supplied

The legacy `manager-claim-*-reward*.ts` scripts looped over
`farms.getAllFarmsForUser(...)`, sending one transaction per discovered farm. The
`kamino:*:claim-reward[-with-index]` commands instead handle **one resolved
farm/reward per invocation**: the operator passes `--farm-state`, `--user-state`,
and `--reward-mint` (matching the architecture rule that multi-tx orchestration
is a CLI/processor concern). The reward→asset Jupiter swap is built only when
`--swap-amount` is given and the reward mint differs from the asset.

### Optional LUT-extend (deferred)

Several legacy `init`/admin scripts (`admin-init-vault*`, `admin-add-adaptor`,
`admin-init-direct-withdraw`, `manager-initialize-curve`) sent their main
transaction and then, in a **second** transaction, created/extended a lookup
table with the instruction's accounts. Per the operation-builder contract (one
builder = one operation; multi-tx orchestration is a CLI/processor concern,
[architecture.md](./architecture.md) rule 8), the builders return only the main
transaction. Consequences:

- **Spot Earn** exposes the extend step as its own command,
  `spot:earn:extend-lut` — fully covered.
- `vault:init`, `vault:init-and-set-token-metadata`, `vault:add-adaptor`,
  `vault:init-direct-withdraw`, and `trustful:curve:init` (marked 🟡 above) build
  only the primary transaction. The LUT building blocks already exist in core
  (`collectInstructionAddresses`, `buildExtendLookupTableInstructions`,
  `getAddressesByLookupTable`); a dedicated extend command for these is the
  outstanding follow-up. Compiling against an **existing** LUT works everywhere
  via the `lookupTableAddresses` passthrough, so operators with a populated LUT
  are unaffected.

### `*-with-index` reward variants share one builder

The Kamino `*-with-index` commands are the same builder as their base command
with `--reward-index` set (it prepends the u64-LE index and switches to the
`*_WITH_INDEX` discriminator). Separate command names are kept because the legacy
scripts had separate entrypoints.

### `vault:update-config` replaces source edits

The legacy `admin-update-vault-config.ts` was driven by editing `config/base.ts`.
The command takes `--field <name> --value <raw|address>` and updates one field
per call; run `vault:update-config --help` for the field list.

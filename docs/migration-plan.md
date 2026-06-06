# Migration Plan

This document is the **order** in which the legacy fork-per-integration scripts move into this repo. The **shape** every migration must follow — package responsibilities, operation-builder contract, command naming, web3.js isolation, where operational values live — is defined in [architecture.md](./architecture.md). Read that first.

Legacy repos are migration references only and live at:

- `/Users/shayn/Desktop/voltr/voltr-base-scripts`
- `/Users/shayn/Desktop/voltr/voltr-kamino-scripts`
- `/Users/shayn/Desktop/voltr/voltr-spot-scripts`
- `/Users/shayn/Desktop/voltr/voltr-trustful-scripts`

Do not edit them as part of migration work.

## 1. Shared core (done)

Land in `packages/core`:

- signer loading — done (`loadSignerFromFile`).
- profile loading and `ScriptContext` — done (`loadProfile`, `createScriptContext`).
- optimized send/confirm with compute-unit estimation and priority fee — done (`sendAndConfirmOptimizedTx`).
- lookup-table fetch + extend — done (`getAddressesByLookupTable`, `buildExtendLookupTableInstructions`).
- token-account setup — done (`setupTokenAccount`).
- web3.js ↔ kit interop — done (`packages/core/src/interop/web3-kit.ts`).
- transaction processor with `print` / `execute` / `simulate` / `multisig` modes — done (`processOperation`).
- vault operation builders + query helpers — done (VOL-222). See the migration map below.

### Base vault migration map (VOL-222)

Every legacy base script now maps to a core builder or query helper. Builders
return a `BuiltOperation`; query helpers return JSON-serializable data. The
builder `label` equals the eventual CLI command name.

| Legacy script (`voltr-base-scripts/src/scripts/`) | Core export | Label | File |
| --- | --- | --- | --- |
| `user-deposit-vault.ts` | `buildDepositVaultOperation` | `vault:deposit` | `vault/operations.ts` |
| `user-request-withdraw-vault.ts` | `buildRequestWithdrawVaultOperation` | `vault:request-withdraw` | `vault/operations.ts` |
| `user-cancel-request-withdraw-vault.ts` | `buildCancelRequestWithdrawVaultOperation` | `vault:cancel-request-withdraw` | `vault/operations.ts` |
| `user-withdraw-vault.ts` | `buildWithdrawVaultOperation` | `vault:withdraw` | `vault/operations.ts` |
| `user-instant-withdraw-vault.ts` | `buildInstantWithdrawVaultOperation` | `vault:instant-withdraw` | `vault/operations.ts` |
| `user-query-position.ts` | `queryVaultPosition` (query) | `vault:query:position` | `vault/queries.ts` |
| `query-strategy-positions.ts` | `queryStrategyPositions` (query) | `vault:query:strategy-positions` | `vault/queries.ts` |
| `admin-init-vault.ts` | `buildInitVaultOperation` | `vault:init` | `vault/admin.ts` |
| `admin-init-vault-and-set-token-metadata.ts` | `buildInitVaultWithMetadataOperation` | `vault:init-with-metadata` | `vault/admin.ts` |
| `admin-set-token-metadata.ts` | `buildSetTokenMetadataOperation` | `vault:set-token-metadata` | `vault/admin.ts` |
| `admin-update-vault-config.ts` | `buildUpdateVaultConfigOperation` | `vault:update-config` | `vault/admin.ts` |
| `admin-accept-vault-admin.ts` | `buildAcceptVaultAdminOperation` | `vault:accept-admin` | `vault/admin.ts` |
| `admin-harvest-fee.ts` | `buildHarvestFeeOperation` | `vault:harvest-fee` | `vault/admin.ts` |

Shared pieces extracted alongside the builders:

- `vault/constants.ts` — `NATIVE_MINT` (wSOL) and `PROTOCOL_ADMIN` (fixed
  protocol fee recipient; no longer a per-script constant).
- `vault/config.ts` — `VaultInitConfig` / `LpTokenMetadata` types, the
  `VaultConfigField` re-export, and `serializeVaultConfigValue` (the
  field-dependent update-config value encoder, unit-tested).

Intentionally **not** migrated as part of a builder:

- The optional lookup-table **create + extend** that `admin-init-vault*`
  performed as two extra transactions after initializing the vault. That is
  multi-transaction orchestration, which the operation-builder contract defers
  to the CLI/processor layer (see [architecture.md](./architecture.md), rule 8).
  The init builders return only the vault-initialization transaction; the LUT
  building blocks already exist in core (`buildExtendLookupTableInstructions`,
  `collectInstructionAddresses`, `getAddressesByLookupTable`) for the CLI ticket
  to compose once multi-tx orchestration lands. Using an *existing* LUT is
  already supported everywhere via the `lookupTableAddresses` passthrough.

Reference: `/Users/shayn/Desktop/voltr/voltr-base-scripts/src/scripts/`.

## 2. Adapter builders (independent workstreams)

Each adapter is an independent migration. Adapter packages do not import each other — see [architecture.md](./architecture.md#independence-between-adapters).

### Kamino

Reference: `/Users/shayn/Desktop/voltr/voltr-kamino-scripts/src/scripts/`. Target package: `packages/kamino/src/operations/`.

Operation builders are **migrated (VOL-225)** — see
[kamino-migration.md](./kamino-migration.md) for the full old-script → builder
map, shared-module layout, and deferral reasons. CLI wiring is still pending.

- `manager-deposit-market.ts` → `kamino:market:deposit` — done (replaced the placeholder)
- `manager-initialize-market.ts` → `kamino:market:init` — done
- `manager-withdraw-market.ts` → `kamino:market:withdraw` — done
- `manager-initialize-kvault.ts` → `kamino:kvault:init` — done
- `manager-deposit-kvault.ts` → `kamino:kvault:deposit` — done
- `manager-withdraw-kvault.ts` → `kamino:kvault:withdraw` — done
- `manager-claim-market-reward[-with-index].ts` → `kamino:market:claim-reward` — done (index optional)
- `manager-claim-kvault-rewards[-with-index].ts` → `kamino:kvault:claim-rewards` — done (index optional)
- `user-direct-withdraw-strategy.ts` → `kamino:user:direct-withdraw` — done
- `user-request-and-direct-withdraw-strategy.ts` → `kamino:user:request-and-direct-withdraw` — done
- `admin-add-adaptor.ts` → `kamino:admin:add-adaptor` — deferred to VOL-224
- `admin-init-direct-withdraw.ts` → `kamino:admin:init-direct-withdraw` — deferred to VOL-224
- `query-strategy-positions.ts` → `kamino:query:strategy-positions` (query) — not in VOL-225 scope

### Spot (done — VOL-226)

Reference: `/Users/shayn/Desktop/voltr/voltr-spot-scripts/src/scripts/`. Target package: `packages/spot/`.

Spot/Jupiter-specific PDA derivation, Jupiter swap setup, oracle remaining accounts,
and earn logic now live in `packages/spot`. Operational values come from profile
fields (`integrations.spot.*`, `vault.*`) and CLI args (amount, slippage, Jupiter
max accounts) — `config/spot.ts` and `config/base.ts` are no longer used. Jupiter
program IDs, the adaptor program ID, seeds, and discriminators live in
`packages/spot/src/constants.ts`. The package stays 100% `@solana/kit` (Jupiter is
a REST API, not a web3.js SDK), so no web3.js types are pulled in.

| Legacy script | New command | Builder / query |
| --- | --- | --- |
| `manager-initialize-spot.ts` | `spot:spot:init` | `buildSpotInitOperation` (`operations/spot.ts`) |
| `manager-buy-spot.ts` | `spot:spot:buy` | `buildSpotBuyOperation` (`operations/spot.ts`) |
| `manager-sell-spot.ts` | `spot:spot:sell` | `buildSpotSellOperation` (`operations/spot.ts`) |
| `manager-initialize-earn.ts` (tx 1) | `spot:earn:init` | `buildSpotEarnInitOperation` (`operations/earn.ts`) |
| `manager-initialize-earn.ts` (tx 2, optional LUT) | `spot:earn:extend-lut` | `buildSpotEarnExtendLookupTableOperation` (`operations/earn.ts`) |
| `manager-deposit-earn.ts` | `spot:earn:deposit` | `buildSpotEarnDepositOperation` (`operations/earn.ts`) |
| `manager-withdraw-earn.ts` | `spot:earn:withdraw` | `buildSpotEarnWithdrawOperation` (`operations/earn.ts`) |
| `query-strategy-positions.ts` | `spot:query:strategy-positions` | `querySpotStrategyPositions` (`queries/strategy-positions.ts`) |
| `admin-add-adaptor.ts` | `spot:admin:add-adaptor` | Deferred to VOL-224 (generic adaptor admin helper). |
| `admin-init-direct-withdraw.ts` | `spot:admin:init-direct-withdraw` | Deferred to VOL-224. |

Notes:

- `manager-initialize-earn.ts` was a two-transaction flow (init strategy, then
  extend the lookup table). Per the "one builder, one operation" rule it splits
  into `spot:earn:init` and `spot:earn:extend-lut`.
- **`spot:spot:sell` corrects a latent bug.** The legacy `manager-sell-spot.ts`
  passed `amountIn = 0` (and the asset→foreign direction) to its Jupiter helper,
  so it never actually built a swap. `buildSpotSellOperation` implements the
  intended behavior — a foreign→asset swap of `amount`, symmetric with buy.
- Jupiter swap setup is encapsulated in `packages/spot/src/jupiter.ts`
  (`setupJupiterSwap`) and unit-tested in `jupiter.test.ts` independently of the
  CLI via an injectable `fetch`.
- CLI command wiring for these operations is intentionally out of scope for
  VOL-226 (tracked separately).

### Trustful

Reference: `/Users/shayn/Desktop/voltr/voltr-trustful-scripts/src/scripts/`. Target package: `packages/trustful/src/operations/`.

Good first migration: `manager-deposit-arbitrary.ts` → `trustful:arbitrary:deposit` (placeholder exists in `packages/trustful/src/operations/arbitrary.ts`).

Then, in any order:

- `manager-initialize-arbitrary.ts` → `trustful:arbitrary:init`
- `manager-initialize-curve.ts` → `trustful:curve:init`
- `manager-borrow-curve.ts` → `trustful:curve:borrow`
- (any `manager-repay-curve` once present) → `trustful:curve:repay`
- `admin-add-adaptor.ts` → `trustful:admin:add-adaptor`
- `admin-remove-adaptor.ts` → `trustful:admin:remove-adaptor`

## 3. CLI commands

After each operation builder is migrated, add a command in `apps/cli/src/index.ts` (or a `commands/<group>.ts` file once a group grows). Follow the recipe and the worked example in [architecture.md](./architecture.md#how-to-add-a-new-operation-builder--cli-command).

## 4. Profile schema growth

As adapter operations land, extend `configs/examples/*.json` with the fields they need under `integrations.<adapter>` and reflect them in `ScriptProfile` (`packages/core/src/types.ts`). Profile changes must be additive — old profiles should keep working.

## 5. Deprecate old repos

Once all operations for an adapter are migrated:

- replace each legacy script with a thin wrapper that delegates to `voltr-scripts` (or remove it);
- update the legacy repo README to point here;
- stop editing source files for routine operational values in the legacy repo (the rule already applies in this repo — see [architecture.md](./architecture.md#where-operational-values-live)).

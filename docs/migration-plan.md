# Migration Plan

This document is the **order** in which the legacy fork-per-integration scripts move into this repo. The **shape** every migration must follow — package responsibilities, operation-builder contract, command naming, web3.js isolation, where operational values live — is defined in [architecture.md](./architecture.md). Read that first.

Legacy repos are migration references only and live at:

- `/Users/shayn/Desktop/voltr/voltr-base-scripts`
- `/Users/shayn/Desktop/voltr/voltr-kamino-scripts`
- `/Users/shayn/Desktop/voltr/voltr-spot-scripts`
- `/Users/shayn/Desktop/voltr/voltr-trustful-scripts`

Do not edit them as part of migration work.

## 1. Shared core (in progress)

Land in `packages/core`:

- signer loading — done (`loadSignerFromFile`).
- profile loading and `ScriptContext` — done (`loadProfile`, `createScriptContext`).
- optimized send/confirm with compute-unit estimation and priority fee — done (`sendAndConfirmOptimizedTx`).
- lookup-table fetch + extend — done (`getAddressesByLookupTable`, `buildExtendLookupTableInstructions`).
- token-account setup — done (`setupTokenAccount`).
- web3.js ↔ kit interop — done (`packages/core/src/interop/web3-kit.ts`).
- transaction processor with `print` / `execute` modes — done (`processOperation`). `simulate` and `multisig` are stubbed and must be added once in `packages/core/src/tx/processor.ts`, not per-adapter.
- vault operation builders — `vault:deposit` done. Remaining `vault:*` to migrate:
  - `user-instant-withdraw-vault.ts` → `vault:instant-withdraw`
  - `user-request-withdraw-vault.ts` → `vault:request-withdraw`
  - `user-cancel-request-withdraw-vault.ts` → `vault:cancel-request-withdraw`
  - `user-withdraw-vault.ts` → `vault:withdraw`
  - `user-query-position.ts` → `vault:query:position` (query, not tx)
  - `admin-init-vault.ts` / `admin-init-vault-and-set-token-metadata.ts` → `vault:init` / `vault:init-with-metadata`
  - `admin-update-vault-config.ts` → `vault:update-config`
  - `admin-accept-vault-admin.ts` → `vault:accept-admin`
  - `admin-set-token-metadata.ts` → `vault:set-token-metadata`
  - `admin-harvest-fee.ts` → `vault:harvest-fee`
  - `query-strategy-positions.ts` → `vault:query:strategy-positions` (query)

Reference: `/Users/shayn/Desktop/voltr/voltr-base-scripts/src/scripts/`.

## 2. Adapter builders (independent workstreams)

Each adapter is an independent migration. Adapter packages do not import each other — see [architecture.md](./architecture.md#independence-between-adapters).

### Kamino

Reference: `/Users/shayn/Desktop/voltr/voltr-kamino-scripts/src/scripts/`. Target package: `packages/kamino/src/operations/`.

Good first migration: `manager-deposit-market.ts` → `kamino:market:deposit` (placeholder exists in `packages/kamino/src/operations/deposit-market.ts`).

Then, in any order:

- `manager-initialize-market.ts` → `kamino:market:init`
- `manager-withdraw-market.ts` → `kamino:market:withdraw`
- `manager-initialize-kvault.ts` → `kamino:kvault:init`
- `manager-deposit-kvault.ts` → `kamino:kvault:deposit`
- `manager-withdraw-kvault.ts` → `kamino:kvault:withdraw`
- `manager-claim-market-reward[-with-index].ts` → `kamino:market:claim-reward`
- `manager-claim-kvault-rewards[-with-index].ts` → `kamino:kvault:claim-rewards`
- `admin-add-adaptor.ts` → `kamino:admin:add-adaptor`
- `admin-init-direct-withdraw.ts` → `kamino:admin:init-direct-withdraw`
- `user-direct-withdraw-strategy.ts` → `kamino:user:direct-withdraw`
- `user-request-and-direct-withdraw-strategy.ts` → `kamino:user:request-and-direct-withdraw`
- `query-strategy-positions.ts` → `kamino:query:strategy-positions` (query)

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

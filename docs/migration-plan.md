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

### Spot

Reference: `/Users/shayn/Desktop/voltr/voltr-spot-scripts/src/scripts/`. Target package: `packages/spot/src/operations/`.

Good first migration: `manager-initialize-spot.ts` → `spot:spot:init` (placeholder pattern in `packages/spot/src/operations/spot.ts`).

Then, in any order:

- `manager-buy-spot.ts` → `spot:spot:buy`
- `manager-sell-spot.ts` → `spot:spot:sell`
- `manager-initialize-earn.ts` → `spot:earn:init`
- `manager-deposit-earn.ts` → `spot:earn:deposit`
- `manager-withdraw-earn.ts` → `spot:earn:withdraw`
- `admin-add-adaptor.ts` → `spot:admin:add-adaptor`
- `admin-init-direct-withdraw.ts` → `spot:admin:init-direct-withdraw`
- `query-strategy-positions.ts` → `spot:query:strategy-positions` (query)

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

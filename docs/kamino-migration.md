# Kamino migration (VOL-225)

Maps the legacy `voltr-kamino-scripts/src/scripts/*` scripts to the operation
builders now in `packages/kamino`. The **shape** every builder follows is the
operation-builder contract in [architecture.md](./architecture.md); the overall
order is in [migration-plan.md](./migration-plan.md). This document records what
moved where and the few deliberate deferrals.

CLI command wiring is intentionally **out of scope** for VOL-225 — these are
builders only. The `Label` column is the command name each builder's `label`
field already uses, so wiring is a later, mechanical step.

## Script → builder map

| Legacy script | Builder (`packages/kamino`) | Label | Status |
| --- | --- | --- | --- |
| `manager-initialize-market.ts` | `buildKaminoMarketInitOperation` | `kamino:market:init` | Migrated |
| `manager-deposit-market.ts` | `buildKaminoMarketDepositOperation` | `kamino:market:deposit` | Migrated (replaces the placeholder) |
| `manager-withdraw-market.ts` | `buildKaminoMarketWithdrawOperation` | `kamino:market:withdraw` | Migrated |
| `manager-initialize-kvault.ts` | `buildKaminoKvaultInitOperation` | `kamino:kvault:init` | Migrated |
| `manager-deposit-kvault.ts` | `buildKaminoKvaultDepositOperation` | `kamino:kvault:deposit` | Migrated |
| `manager-withdraw-kvault.ts` | `buildKaminoKvaultWithdrawOperation` | `kamino:kvault:withdraw` | Migrated |
| `manager-claim-market-reward.ts` | `buildKaminoMarketClaimRewardOperation` (no `rewardIndex`) | `kamino:market:claim-reward` | Migrated |
| `manager-claim-market-reward-with-index.ts` | `buildKaminoMarketClaimRewardOperation` (`rewardIndex` set) | `kamino:market:claim-reward` | Migrated (folded into the above) |
| `manager-claim-kvault-rewards.ts` | `buildKaminoKvaultClaimRewardsOperation` (no `rewardIndex`) | `kamino:kvault:claim-rewards` | Migrated |
| `manager-claim-kvault-rewards-with-index.ts` | `buildKaminoKvaultClaimRewardsOperation` (`rewardIndex` set) | `kamino:kvault:claim-rewards` | Migrated (folded into the above) |
| `user-direct-withdraw-strategy.ts` | `buildKaminoUserDirectWithdrawOperation` | `kamino:user:direct-withdraw` | Migrated |
| `user-request-and-direct-withdraw-strategy.ts` | `buildKaminoUserRequestAndDirectWithdrawOperation` | `kamino:user:request-and-direct-withdraw` | Migrated |
| `admin-add-adaptor.ts` | — | `kamino:admin:add-adaptor` | Deferred to VOL-224 |
| `admin-init-direct-withdraw.ts` | — | `kamino:admin:init-direct-withdraw` | Deferred to VOL-224 |

`query-strategy-positions.ts` is not in the VOL-225 list (it is a vault-level
query tracked under the shared-core work in
[migration-plan.md](./migration-plan.md)), so it is not migrated here.

## Shared modules (no per-operation duplication)

The Kamino-specific account derivation is factored out so each builder only
declares its operation-specific *ordering*:

- `constants.ts` — adaptor / klend / kvaults / farms program ids, sysvars, the
  default (all-zero) address, and the adaptor instruction discriminators. These
  live in the adapter package per the contract; builders never reach into the
  SDK for an `Address` constant.
- `pda.ts` — every PDA derivation (obligation, lending-market authority, user
  metadata, reserve liquidity-supply / collateral-mint, kvault shares mint /
  token vault / base authority / event authority / global config / ctoken
  vault, and the farm reward PDAs), all using `@solana/kit`.
- `reserve.ts` — `loadMarketReserveAccounts`: decodes the klend `Reserve` and
  resolves the market remaining accounts (incl. the no-farm fallback to the
  klend program id).
- `kvault.ts` — `loadKvaultReserves` plus `buildKvaultDepositAccounts` /
  `buildKvaultWithdrawAccounts`, which assemble the kvault remaining-account
  lists shared by deposit, withdraw, and both user direct-withdraw flows.
- account-meta / encoding helpers (`readonlyAccount`, `writableAccount`,
  `withRemainingAccounts`, `encodeU64Le`) are shared `@voltr/scripts-core`
  helpers (consolidated in VOL-234), not adapter-local.
- `swap.ts` — the `KaminoJupiterSwap` payload type and `additionalArgs` builder
  for reward claims.

The operation builders are grouped one module per strategy domain
(`operations/market.ts`, `operations/kvault.ts`, `operations/user.ts`).

## klend-sdk used as a decoder only

`@kamino-finance/klend-sdk` (7.x) targets an older `@solana/kit` major than this
repo (6.x). To avoid a dual-version `Address`/`Rpc` mismatch, the adapter never
passes the repo rpc into the SDK. Instead it fetches raw account bytes with the
repo's kit rpc and decodes them with the SDK's version-agnostic, rpc-free
`Reserve.decode` / `VaultState.decode`. Addresses read off the decoded state are
re-branded to the repo's `Address` at the boundary (`asKitAddress`). This is the
same boundary-isolation idea the architecture doc describes for web3.js.

## Claim-reward scope

The two claim builders cover **one already-resolved farm/reward each** and
accept a pre-resolved, kit-typed `jupiterSwap` payload. Two pieces are
deliberately left to the (out-of-scope) CLI layer, matching the architecture's
rule that multi-tx orchestration is a CLI/processor concern:

- **Farm discovery** — the legacy scripts loop over
  `farms.getAllFarmsForUser(...)` (one transaction per farm). Resolving the
  claimable farms with `@kamino-finance/farms-sdk` and calling the builder once
  per farm belongs in the CLI. Keeping it out means the builder needs no
  farms-sdk dependency and stays a single-transaction unit.
- **Jupiter routing** — the reward→asset swap embedded in the adaptor's
  `additionalArgs` comes from the Jupiter HTTP API. That external call is a
  CLI-layer helper; the builder takes the resolved swap bytes + accounts so it
  stays pure and unit-testable. When the reward mint equals the asset mint, omit
  the payload (no swap).

The `-with-index` variants are folded into the base builders via the optional
`rewardIndex` arg: when set, the builder prepends the u64-LE index to
`additionalArgs` and uses the `*_WITH_INDEX` discriminator.

## Profile fields

Reserve and kvault addresses come from the profile
(`integrations.kamino.reserveAddress`, `integrations.kamino.kvaultAddress`),
not from edited TypeScript config, satisfying the "values live in profiles" rule.
The existing `ScriptProfile` schema already carries both fields, so no profile
schema change was required for this migration. Per-call values (amounts,
reward index, withdraw flags, signer paths) are builder args the CLI will supply
from flags.

## Behavior-preservation notes

- Remaining-account **order and writability** match the legacy scripts
  exactly for every operation.
- The market no-farm case still falls back to the klend program id for both
  `reserveFarmState` and `obligationFarm`.
- kvault deposit/withdraw still append the vault's own `vaultLookupTable` (read
  from `VaultState`) to the operation's lookup tables.
- Market reserve deposit/withdraw read `reserveLiquiditySupply` /
  `reserveCollateralMint` from reserve state, while kvault withdraw derives them
  as PDAs from the max-allocated reserve's lending market — preserving the
  original distinction.
- The one-time LUT *extension* the legacy `init` scripts performed as a second
  transaction is not part of these builders (one builder = one operation); LUT
  maintenance uses the core LUT helpers separately.

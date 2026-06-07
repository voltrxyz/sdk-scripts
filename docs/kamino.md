# Kamino integration

The `kamino:*` commands operate two Kamino strategy domains on a Voltr vault:

- **market** (`kamino:market:*`) — lend the vault asset into a Kamino Lending
  (klend) reserve.
- **kvault** (`kamino:kvault:*`) — allocate the vault asset into a Kamino vault
  (kvault), covering both manager strategy operations and user direct-withdraws.

Builders live in `packages/kamino`; the CLI wiring is in
`apps/cli/src/commands/kamino.ts`. Every builder follows the operation-builder
contract in [architecture.md](./architecture.md): `build…Operation(ctx, args) →
BuiltOperation`, no filesystem/CLI/sending, kit-native, `label` == command name.

## Commands

| Command | Builder (`@voltr/scripts-kamino`) | Role | Strategy id |
| --- | --- | --- | --- |
| `kamino:market:init` | `buildKaminoMarketInitOperation` | manager | reserve |
| `kamino:market:deposit` | `buildKaminoMarketDepositOperation` | manager | reserve |
| `kamino:market:withdraw` | `buildKaminoMarketWithdrawOperation` | manager | reserve |
| `kamino:market:claim-reward[-with-index]` | `buildKaminoMarketClaimRewardOperation` | manager | reserve |
| `kamino:kvault:init` | `buildKaminoKvaultInitOperation` | manager | kvault |
| `kamino:kvault:deposit` | `buildKaminoKvaultDepositOperation` | manager | kvault |
| `kamino:kvault:withdraw` | `buildKaminoKvaultWithdrawOperation` | manager | kvault |
| `kamino:kvault:claim-reward[-with-index]` | `buildKaminoKvaultClaimRewardOperation` | manager | kvault |
| `kamino:kvault:direct-withdraw` | `buildKaminoKvaultDirectWithdrawOperation` | user | kvault |
| `kamino:kvault:request-and-direct-withdraw` | `buildKaminoKvaultRequestAndDirectWithdrawOperation` | user | kvault |

The adaptor-administration commands (`vault:add-adaptor`,
`vault:init-direct-withdraw`) are generic vault operations — see
[adaptor-admin.md](./adaptor-admin.md). The CLI defaults those commands to the
Kamino adaptor and the profile's Kamino kvault; override `--adaptor-program`
(and then pass `--discriminator`) to administer a different adaptor.

The `-with-index` claim variants are the same builder with `rewardIndex` set: it
prepends the u64-LE index to the adaptor `additionalArgs`, switches to the
`*_WITH_INDEX` discriminator, and emits the `-with-index` label so command ==
label. Separate command names exist because a multi-reward farm needs the slot.

## Profile fields and flags

Per the [where operational values live](./architecture.md#where-operational-values-live)
rule:

- **Profile** (`integrations.kamino.*`): `reserveAddress` (market strategy id),
  `kvaultAddress` (kvault strategy id), and `directWithdrawDiscriminator` — the
  8-byte adaptor instruction `vault:init-direct-withdraw` binds when using the
  default Kamino adaptor (a per-deployment value).
- **Flags** (per call): amount, reward identity (`--reward-mint`,
  `--farm-state`, `--user-state`), reward index, withdraw flags, signer paths,
  and optional Jupiter swap settings (`--swap-amount`, `--slippage-bps`,
  `--jupiter-max-accounts`).

Signers: manager strategy operations use `--manager-keypair` / `MANAGER_KEYPAIR`;
user direct-withdraws use `--user-keypair` / `USER_KEYPAIR`.

## Shared modules

Kamino account derivation is factored out so each builder declares only its
operation-specific account *ordering*:

- `constants.ts` — adaptor / klend / kvaults / farms program ids, sysvars, the
  default (all-zero) address, and the adaptor instruction discriminators.
  Builders never reach into the SDK for an `Address` constant.
- `pda.ts` — every PDA derivation (obligation, lending-market authority, user
  metadata, reserve liquidity-supply / collateral-mint, kvault shares mint /
  token vault / base authority / event authority / global config / ctoken vault,
  and the farm reward PDAs), all using `@solana/kit`.
- `reserve.ts` — `loadMarketReserveAccounts`: decodes the klend `Reserve` and
  resolves the market remaining accounts (including the no-farm fallback to the
  klend program id).
- `kvault.ts` — `loadKvaultReserves` plus `buildKvaultDepositAccounts` /
  `buildKvaultWithdrawAccounts`, the kvault remaining-account lists shared by
  deposit, withdraw, and both user direct-withdraw flows.
- `swap.ts` — the `KaminoJupiterSwap` payload type and `additionalArgs` builder
  for reward claims.

Builders are grouped one module per strategy domain (`operations/market.ts`,
`operations/kvault.ts`). The `kvault` module holds both the manager strategy
operations and the user direct-withdraw flows, since both act on the kvault
strategy; the signer role is carried by the `--<role>-keypair` flag, not the
domain segment.

## klend-sdk is a decoder only

`@kamino-finance/klend-sdk` (7.x) targets an older `@solana/kit` major than this
repo (6.x). To avoid a dual-version `Address`/`Rpc` mismatch, the adapter never
passes the repo rpc into the SDK. Instead it fetches raw account bytes with the
repo's kit rpc and decodes them with the SDK's version-agnostic, rpc-free
`Reserve.decode` / `VaultState.decode`. Addresses read off the decoded state are
re-branded to the repo's `Address` at the boundary (`asKitAddress`) — the same
boundary isolation the architecture doc describes for the
[web3.js compatibility boundary](./architecture.md#web3js-compatibility-boundary).

## Claim-reward scope

Each claim command handles **one already-resolved farm/reward** and accepts a
pre-resolved, kit-typed `jupiterSwap` payload. Two pieces are CLI
responsibilities, because resolving and orchestrating multiple farms is a
CLI/processor concern:

- **Farm discovery** — resolving the claimable farms is operator-supplied: each
  invocation takes one `--farm-state`, `--user-state`, and `--reward-mint`.
- **Jupiter routing** — the reward→asset swap embedded in the adaptor
  `additionalArgs` comes from the Jupiter HTTP API. The CLI resolves the swap
  when `--swap-amount` is provided; the builder takes the resolved swap bytes +
  accounts so it stays pure and unit-testable. When the reward mint equals the
  asset mint or `--swap-amount` is omitted, no swap is attached.

## Behavior notes

- Remaining-account **order and writability** are fixed by the adaptor CPI for
  each operation.
- The market no-farm case falls back to the klend program id for both
  `reserveFarmState` and `obligationFarm`.
- kvault deposit/withdraw append the vault's own `vaultLookupTable` (read from
  `VaultState`) to the operation's lookup tables.
- Market reserve deposit/withdraw read `reserveLiquiditySupply` /
  `reserveCollateralMint` from reserve state, while kvault withdraw derives them
  as PDAs from the max-allocated reserve's lending market.
- The init builders return only the initialization transaction; pre-loading a
  lookup table afterwards uses the core LUT helpers separately.

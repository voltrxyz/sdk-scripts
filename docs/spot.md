# Spot integration

The `spot:*` commands cover two strategy domains under one Voltr adaptor:

- **swap** (`spot:swap:*`) — swap the vault asset into/out of a foreign asset
  through the Jupiter swap API.
- **earn** (`spot:earn:*`) — deposit/withdraw the vault asset through Jupiter
  Earn (lending).

Builders live in `packages/spot`; the CLI wiring is in
`apps/cli/src/commands/spot.ts`. Every builder follows the operation-builder
contract in [architecture.md](./architecture.md). The package stays 100%
`@solana/kit` — Jupiter is a REST API, not a web3.js SDK, so no web3.js types are
pulled in.

## Commands

| Command | Builder / query (`@voltr/scripts-spot`) | Role |
| --- | --- | --- |
| `spot:swap:init` | `buildSpotSwapInitOperation` | manager |
| `spot:swap:buy` | `buildSpotSwapBuyOperation` | manager |
| `spot:swap:sell` | `buildSpotSwapSellOperation` | manager |
| `spot:earn:init` | `buildSpotEarnInitOperation` | manager |
| `spot:earn:extend-lut` | `buildSpotEarnExtendLutOperation` | manager |
| `spot:earn:deposit` | `buildSpotEarnDepositOperation` | manager |
| `spot:earn:withdraw` | `buildSpotEarnWithdrawOperation` | manager |
| `spot:earn:init-direct-withdraw` | `buildSpotEarnInitDirectWithdrawOperation` | admin |
| `spot:query:strategy-positions` | `querySpotStrategyPositions` (query) | none (read-only) |

Register the Spot adaptor on the vault once with `vault:add-adaptor
--adaptor-program <SPOT_ADAPTOR_PROGRAM_ID>` before the manager can route through
Spot — `vault:add-adaptor` is a generic vault operation
([adaptor-admin.md](./adaptor-admin.md)).

## Profile fields and flags

- **Profile**: asset mint / token program (`vault.*`); the foreign mint, foreign
  token program, and both Pyth oracle addresses
  (`integrations.spot.foreignMintAddress` / `foreignTokenProgram` /
  `assetOracleAddress` / `foreignOracleAddress`); the lookup table
  (`vault.lookupTableAddress`); and
  `integrations.spot.directWithdrawDiscriminator`.
- **Flags**: amount (`--amount`), slippage (`--slippage-bps`), the Jupiter
  account cap (`--jupiter-max-accounts`, default `16`), and the optional
  `--minimum-threshold-amount-out`.
- **Role signers**: `--manager-keypair` / `--admin-keypair` (or the matching env
  vars), never profiles.

### `directWithdrawDiscriminator`

`spot:earn:init-direct-withdraw` needs the adaptor's 8-byte direct-withdraw
instruction discriminator. This is a per-deployment value, not a fixed adapter
constant, so it lives in the profile:

```jsonc
"integrations": {
  "spot": {
    // …foreign mint / token program / oracle addresses…
    "directWithdrawDiscriminator": [232, 204, 244, 40, 201, 192, 7, 194]
  }
}
```

It is validated by the schema (exactly 8 bytes, each `0..255`) and read by the
`requireSpotDirectWithdrawDiscriminator` accessor. An empty array `[]` (the
example-template placeholder) is treated as "not provided", so only profiles that
actually run direct-withdraw fill it in. The generic `vault:init-direct-withdraw`
command instead takes the discriminator as `--discriminator <8 comma-separated
bytes>`, since it is adapter-agnostic.

## Account derivation

Spot/Jupiter account derivation lives entirely in `packages/spot`
(`deriveJupiterEarnAccounts`, `findJupiterLendingPda`,
`findSpotOracleInitReceiptPda`, `setupJupiterSwap`); the CLI commands never
re-derive it. Jupiter swap setup is encapsulated in
`packages/spot/src/jupiter.ts` (`setupJupiterSwap`) and unit-tested independently
of the CLI via an injectable `fetch`.

## Behavior notes

- **`spot:swap:sell` is symmetric with `spot:swap:buy`.** Sell performs a
  foreign→asset swap of `--amount`; buy performs the asset→foreign swap. Verify
  with `--mode simulate` before executing.
- **`spot:earn:init` and `spot:earn:extend-lut` are separate operations.**
  Initialization is one transaction; pre-loading the lookup table is its own
  command (one builder, one operation). Run `spot:earn:extend-lut` after
  `spot:earn:init` only when the vault uses a lookup table.
- **`spot:query:strategy-positions`** augments each Voltr strategy's position
  value with the strategy's current raw foreign-token balance where available.
- The `spot:earn:*` deposit/withdraw commands act on the vault asset only.

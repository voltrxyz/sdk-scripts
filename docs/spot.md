# Spot integration

The `spot:*` commands cover two strategy domains under one Voltr adaptor:

- **swap** (`spot:swap:*`) — swap the vault asset into/out of a foreign asset
  through the Jupiter swap API.
- **earn** (`spot:earn:*`) — deposit/withdraw the vault asset through Jupiter
  Earn (lending).

For runnable end-to-end workflows (always preview with `--mode print` /
`simulate` before `execute`), see the operator guide's
[Spot buy/sell & Earn flows](./operator-guide.md#spot-buysell--earn-flows). Run
`pnpm cli -- <command> --help` for the exact flags and defaults of any command.

## Commands

| Command | Role |
| --- | --- |
| `spot:swap:init` / `buy` / `sell` | manager |
| `spot:earn:init` / `extend-lut` / `deposit` / `withdraw` | manager |
| `spot:earn:init-direct-withdraw` | admin |
| `spot:query:strategy-positions` | none (read-only) |

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
  account cap (`--jupiter-max-accounts`), and the optional
  `--minimum-threshold-amount-out`.
- **Signers**: `--manager-keypair` / `--admin-keypair` (or the matching env
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

It is validated by the schema (exactly 8 bytes, each `0..255`). An empty array
`[]` (the example-template placeholder) is treated as "not provided", so only
profiles that actually run direct-withdraw fill it in. The generic
`vault:init-direct-withdraw` command instead takes the discriminator as
`--discriminator <8 comma-separated bytes>`, since it is adapter-agnostic.

## Operational constraints

- **`spot:swap:sell` is symmetric with `spot:swap:buy` and performs a real
  swap.** Sell swaps `--amount` of the foreign asset back to the vault asset; buy
  swaps the vault asset into the foreign asset. Verify with `--mode simulate`
  before executing.
- **`spot:earn:init` and `spot:earn:extend-lut` are separate operations.**
  Initialization is one transaction; pre-loading the lookup table is its own
  command. Run `spot:earn:extend-lut` after `spot:earn:init` only when the vault
  uses a lookup table.
- **`spot:earn:*` deposit/withdraw act on the vault asset only.**
- **`spot:query:strategy-positions`** augments each Voltr strategy's position
  value with the strategy's current raw foreign-token balance where available.

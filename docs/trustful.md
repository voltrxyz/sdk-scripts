# Trustful integration

The `trustful:*` commands operate the Trustful adaptor's two strategy families on
a Voltr vault:

- **arbitrary** (`trustful:arbitrary:*`) — an operator-named strategy seeded by
  `integrations.trustful.strategySeedString`.
- **curve** (`trustful:curve:*`) — a per-vault singleton strategy seeded by the
  fixed `"curve"` constant, so the curve commands take **no** seed flag.

All `trustful:*` commands are manager-signed. For runnable end-to-end workflows
(always preview with `--mode print` / `simulate` before `execute`), see the
operator guide's
[Trustful arbitrary & curve flows](./operator-guide.md#trustful-arbitrary--curve-flows).
Run `pnpm cli -- <command> --help` for the exact flags of any command.

## Commands

| Command | Notes |
| --- | --- |
| `trustful:arbitrary:init` | Sets up the vault-strategy ATA, then initializes the strategy. |
| `trustful:arbitrary:deposit` | `--destination`, `--position-value-after`. **Prints the withdrawal-holding account — return strategy assets there before running `trustful:arbitrary:withdraw`.** |
| `trustful:arbitrary:withdraw` | `--position-value-after`. |
| `trustful:curve:init` | Sets up the holding / vault-strategy / manager ATAs, then initializes the strategy. |
| `trustful:curve:borrow` | `--amount`, `--borrow-rate-bps`. |
| `trustful:curve:repay` | `--amount`, `--borrow-rate-bps`. |
| `trustful:curve:remove` | Closes the strategy. |

Register the Trustful adaptor on the vault once with `vault:add-adaptor
--adaptor-program 3pnpK9nrs1R65eMV1wqCXkDkhSgN18xb1G5pgYPwoZjJ` (and deregister
with `vault:remove-adaptor`) — these are generic vault operations
([adaptor-admin.md](./adaptor-admin.md)).

## Profile fields and flags

- **Profile**: `assetMintAddress`, `assetTokenProgram`, `vaultAddress`, and the
  lookup table from `vault.*`; the arbitrary strategy name from
  `integrations.trustful.strategySeedString`. The curve strategy seed is the
  fixed `"curve"` constant — not a profile or flag value.
- **Flags** (per call): amount, `--destination`, `--position-value-after`,
  `--borrow-rate-bps`, and the manager signer path.

## Operational constraints

- **`trustful:arbitrary:deposit` reports the account you must fund before
  withdrawing.** It prints the withdrawal-holding account as operation metadata;
  return strategy assets to that account before running
  `trustful:arbitrary:withdraw`.
- **`trustful:curve:init` builds only the initialization transaction.** If the
  vault uses a lookup table, pre-load it as a separate step (there is no curve
  lookup-table-extension command). Compiling against an existing lookup table is
  supported via the vault's `lookupTableAddress`.

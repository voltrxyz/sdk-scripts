# Trustful integration

The `trustful:*` commands operate the Trustful adaptor's two strategy families on
a Voltr vault:

- **arbitrary** (`trustful:arbitrary:*`) — an operator-named strategy seeded by
  `integrations.trustful.strategySeedString`.
- **curve** (`trustful:curve:*`) — a per-vault singleton strategy seeded by the
  fixed `"curve"` constant (so the curve commands take no seed flag).

All `trustful:*` commands are manager-signed. Builders live in
`packages/trustful`; the CLI wiring is in `apps/cli/src/commands/trustful.ts`.
Every builder follows the operation-builder contract in
[architecture.md](./architecture.md): `build…Operation(ctx, args) →
BuiltOperation`, no filesystem/CLI/sending, kit-native, `label` == command name.

## Commands

| Command | Builder (`@voltr/scripts-trustful`) | Notes |
| --- | --- | --- |
| `trustful:arbitrary:init` | `buildTrustfulArbitraryInitOperation` | Sets up the vault-strategy ATA, then `initialize_strategy`. |
| `trustful:arbitrary:deposit` | `buildTrustfulArbitraryDepositOperation` | `--destination`, `--position-value-after`. Returns the withdrawal-holding account as operation metadata — return assets there before withdrawing. |
| `trustful:arbitrary:withdraw` | `buildTrustfulArbitraryWithdrawOperation` | `--position-value-after`. |
| `trustful:curve:init` | `buildTrustfulCurveInitOperation` | Sets up holding / vault-strategy / manager ATAs, then `initialize_strategy`. |
| `trustful:curve:borrow` | `buildTrustfulCurveBorrowOperation` | `--amount`, `--borrow-rate-bps`. |
| `trustful:curve:repay` | `buildTrustfulCurveRepayOperation` | `--amount`, `--borrow-rate-bps`. |
| `trustful:curve:remove` | `buildTrustfulCurveRemoveOperation` | `close_strategy`. |

Register the Trustful adaptor on the vault once with `vault:add-adaptor
--adaptor-program <TRUSTFUL_ADAPTOR_PROGRAM_ID>` (and deregister with
`vault:remove-adaptor`) — these are generic vault operations
([adaptor-admin.md](./adaptor-admin.md)). `TRUSTFUL_ADAPTOR_PROGRAM_ID` is
exported from the package.

## Profile fields and flags

- **Profile**: `assetMintAddress`, `assetTokenProgram`, `vaultAddress`, and the
  LUT address from `profile.vault.*`; the arbitrary strategy name from
  `integrations.trustful.strategySeedString`.
- **Flags** (per call): amount, `--destination`, `--position-value-after`,
  `--borrow-rate-bps`, and the manager signer path.

The curve strategy seed is a constant (`TRUSTFUL_SEEDS.CURVE`), not a profile or
flag value.

## IDL handling

Every adaptor call except one goes through the vault SDK's generic
`initialize` / `deposit` / `withdraw` / `close` strategy instructions,
parameterized by an 8-byte discriminator from `TRUSTFUL_DISCRIMINATOR`. The one
exception is `transfer_curve` (used by repay), which the vault SDK does not
expose.

**The Anchor IDL is not vendored.** Instead:

- the adaptor **program ID** and all **discriminators** live in
  [`constants.ts`](../packages/trustful/src/constants.ts)
  (`TRUSTFUL_ADAPTOR_PROGRAM_ID`, `TRUSTFUL_DISCRIMINATOR`);
- `transfer_curve` is hand-built in
  [`operations/curve.ts`](../packages/trustful/src/operations/curve.ts) with
  `@solana/kit` — discriminator + `u64` amount + `u16` borrow-rate, with the nine
  accounts in IDL order.

This keeps the package kit-native and free of `@coral-xyz/anchor` /
`@solana/web3.js`, consistent with the rest of the monorepo. The hand-built
`transfer_curve` data and every PDA/ATA derivation are covered by the offline
builder tests.

## Curve strategy seed

The curve strategy is a per-vault singleton seeded by the constant `"curve"`.
**All curve builders derive it from `TRUSTFUL_SEEDS.CURVE`** — init, borrow,
repay, and remove. The adaptor's own `transfer_curve` hard-codes the same
`"curve"` seed in its IDL, so deriving every curve operation from the one
constant keeps the vault-SDK side and the adaptor side in agreement and prevents
repay from desyncing from init/borrow/remove.

## Deferred: LUT extension on curve init

`trustful:curve:init` returns only the init transaction. Optionally extending a
lookup table with the init instruction's accounts is multi-transaction
orchestration, which the operation-builder contract defers to the CLI/processor
layer (one builder, one operation; [architecture.md](./architecture.md) rule 8).
The building blocks live in core (`collectInstructionAddresses` +
`buildExtendLookupTableInstructions`). Compiling against an existing LUT is
supported everywhere via `lookupTableAddresses`.

## Structured metadata

`trustful:arbitrary:deposit` must tell the manager which account to return
strategy assets to before withdrawing. `BuiltOperation` carries an optional
`metadata?: Record<string, string>` field;
`buildTrustfulArbitraryDepositOperation` returns `{ withdrawalHoldingAccount }`,
and the processor prints it in `print`/`execute` modes — surfacing the value
without coupling the builder to `console.log`.

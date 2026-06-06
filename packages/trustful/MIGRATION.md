# Trustful migration (VOL-227)

Maps the legacy `voltr-trustful-scripts` manager/admin scripts to the operation
builders in this package. Source of truth for the migration:
`/Users/shayn/Desktop/voltr/voltr-trustful-scripts/src/scripts/` (read-only).

Builders follow the operation-builder contract in
[`docs/architecture.md`](../../docs/architecture.md): `build…Operation(ctx, args)
→ BuiltOperation`, no filesystem/CLI/sending, kit-native, `label` = command name.

## Script → builder map

| Legacy script                    | Builder                                    | Command label               | Notes |
| -------------------------------- | ------------------------------------------ | --------------------------- | ----- |
| `manager-initialize-arbitrary.ts`| `buildTrustfulArbitraryInitOperation`| `trustful:arbitrary:init`    | Sets up the vault-strategy ATA, then `initialize_strategy`. |
| `manager-deposit-arbitrary.ts`   | `buildTrustfulArbitraryDepositOperation`   | `trustful:arbitrary:deposit` | Forwards `destinationAssetTokenAccount` as a remaining account; position value → `additional_args`. Withdrawal-holding account returned as `BuiltOperation.metadata`. |
| `manager-withdraw-arbitrary.ts`  | `buildTrustfulArbitraryWithdrawOperation`  | `trustful:arbitrary:withdraw`| Holding auth + holding ATA forwarded as remaining accounts. |
| `manager-initialize-curve.ts`    | `buildTrustfulCurveInitOperation`    | `trustful:curve:init`        | Sets up holding / vault-strategy / manager ATAs, then `initialize_strategy`. LUT-extend second transaction is **not** bundled — see [LUT extension](#lut-extension-on-curve-init). |
| `manager-borrow-curve.ts`        | `buildTrustfulCurveBorrowOperation`        | `trustful:curve:borrow`      | Borrow draws from the vault → vault SDK `deposit_strategy` with `BORROW_CURVE`; borrow rate → `additional_args`. |
| `manager-repay-curve.ts`         | `buildTrustfulCurveRepayOperation`         | `trustful:curve:repay`       | Two ix: adaptor `transfer_curve` (hand-built) + vault SDK `withdraw_strategy` with `REPAY_CURVE`. Strategy seed corrected — see [Curve strategy seed](#curve-strategy-seed-repay-correction). |
| `manager-remove-curve.ts`        | `buildTrustfulCurveRemoveOperation`        | `trustful:curve:remove`      | `close_strategy`. |
| `admin-add-adaptor.ts`           | `buildAddAdaptorOperation` (core, VOL-224) | `vault:add-adaptor` | Generic adapter admin helper (see below). CLI wired in VOL-230: `vault:add-adaptor --adaptor-program <TRUSTFUL_ADAPTOR_PROGRAM_ID>`. |
| `admin-remove-adaptor.ts`        | `buildRemoveAdaptorOperation` (core, VOL-224) | `vault:remove-adaptor` | Generic adapter admin helper (see below). CLI wired in VOL-230: `vault:remove-adaptor --adaptor-program <TRUSTFUL_ADAPTOR_PROGRAM_ID>`. |

The remaining legacy scripts (`admin-*-vault*`, `user-*-vault`, `query-*`,
`user-query-position`) are vault-level, not Trustful-specific, and are tracked
under the `vault:*` core migration in
[`docs/migration-plan.md`](../../docs/migration-plan.md), not here.

## Where the legacy `config/trustful.ts` values now come from

Per-deployment values move to the profile; per-call values become builder args
(coerced from CLI flags by the future CLI layer — VOL command for CLI wiring is
out of scope here).

| Legacy `config/trustful.ts`     | New source                                                    |
| ------------------------------- | ------------------------------------------------------------- |
| `strategySeedString`            | profile `integrations.trustful.strategySeedString` → arbitrary builders' `strategySeedString` arg |
| `depositStrategyAmount` / `withdrawStrategyAmount` / `borrowStrategyAmount` / `repayStrategyAmount` | builder `amount` arg |
| `positionValueAfterDeposit`     | `buildTrustfulArbitraryDepositOperation` `positionValueAfterDeposit` arg |
| `positionValueAfterWithdraw`    | `buildTrustfulArbitraryWithdrawOperation` `positionValueAfterWithdraw` arg |
| `destinationAssetTokenAccount`  | `buildTrustfulArbitraryDepositOperation` `destinationAssetTokenAccount` arg |
| `borrowRateBps`                 | curve borrow/repay `borrowRateBps` arg |
| curve strategy seed (`SEEDS.CURVE`) | constant `TRUSTFUL_SEEDS.CURVE` in `constants.ts` |

`assetMintAddress`, `assetTokenProgram`, `vaultAddress`, and the LUT address come
from `profile.vault.*` (already in `ScriptProfile`).

## Decisions

### IDL handling

The legacy package shipped `src/idl/voltr_trustful_adaptor.{json,ts}` and used an
Anchor `Program` (pulling in `@coral-xyz/anchor` + `@solana/web3.js`) for exactly
one instruction: `transfer_curve` in repay. Every other adaptor call goes through
the vault SDK's generic `initialize`/`deposit`/`withdraw`/`close` strategy
instructions parameterized by an 8-byte discriminator.

**Decision: do not vendor the Anchor IDL.** Instead:

- the adaptor **program ID** and all **discriminators** live in
  [`constants.ts`](./src/constants.ts) (`TRUSTFUL_ADAPTOR_PROGRAM_ID`,
  `TRUSTFUL_DISCRIMINATOR`), satisfying "keep adaptor program ID and
  discriminators in the Trustful package";
- `transfer_curve` is hand-built in
  [`operations/curve.ts`](./src/operations/curve.ts) with `@solana/kit` —
  discriminator + `u64` amount + `u16` borrow-rate, nine accounts in IDL order.

This keeps the package kit-native and free of `@coral-xyz/anchor` /
`@solana/web3.js`, consistent with the rest of the monorepo. The hand-built
`transfer_curve` data and every PDA/ATA derivation were verified **byte-for-byte**
against the legacy web3.js + Anchor `BorshInstructionCoder` output.

### Curve strategy seed (repay correction)

The curve strategy is a per-vault singleton seeded by the constant `"curve"`.
`initialize`, `borrow`, and `remove` all derived it from `SEEDS.CURVE`, but the
legacy `manager-repay-curve.ts` derived it from the arbitrary
`strategySeedString` instead — a latent inconsistency that only produced the
correct strategy when the operator happened to set `strategySeedString = "curve"`.

**Decision: all curve builders derive from `TRUSTFUL_SEEDS.CURVE`.** This makes
repay internally consistent with init/borrow/remove (the adaptor's own
`transfer_curve` also hard-codes the `"curve"` seed in its IDL, so the legacy
script could desync the vault-SDK side from the adaptor side).

### LUT extension on curve init

`manager-initialize-curve.ts` sent the init transaction and then, in a **second**
transaction, extended a lookup table with the init instruction's accounts.

**Decision: the init builder returns only the init operation.** Per the
operation-builder contract ("one builder, one operation"; multi-tx orchestration
is a CLI/processor concern), the LUT-extend step is generic and already covered
by core's `collectInstructionAddresses` + `buildExtendLookupTableInstructions`.
The CLI can, after building the init operation, derive the addresses from
`operation.instructions` and extend the LUT as a follow-up transaction. No
Trustful-specific LUT builder is needed.

### Admin add/remove adaptor → VOL-224

`admin-add-adaptor.ts` / `admin-remove-adaptor.ts` are thin wrappers over the
vault SDK's generic `getAddAdaptorInstructionAsync` / `getRemoveAdaptorInstructionAsync`,
parameterized only by `adaptorProgram = TRUSTFUL_ADAPTOR_PROGRAM_ID`. They are
the "generic adapter admin helper migration" explicitly placed **out of scope**
for VOL-227 and **covered by VOL-224**. `TRUSTFUL_ADAPTOR_PROGRAM_ID` is exported
from this package so that work can consume it without duplicating the ID.

VOL-230 wired the CLI for those generic builders as `vault:add-adaptor` /
`vault:remove-adaptor`, which take the adaptor program as a `--adaptor-program`
flag (pass `TRUSTFUL_ADAPTOR_PROGRAM_ID` for the Trustful adaptor) rather than a
`trustful:`-prefixed command, since the operation is adapter-agnostic.

### Structured metadata (preserving user-facing output)

The legacy deposit script printed `"… transfer tokens back to: <holding account>"`.
`BuiltOperation` gained an optional `metadata?: Record<string, string>` field
(the smallest additive change to core). `buildTrustfulArbitraryDepositOperation`
returns `{ withdrawalHoldingAccount }`; the processor prints `metadata` in
`print`/`execute` modes, preserving the message end-to-end without coupling the
builder to `console.log`.

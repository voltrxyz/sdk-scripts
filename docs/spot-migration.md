# Spot CLI wiring (VOL-229)

Wires the Spot / Jupiter Earn operation builders (migrated in VOL-226, see
[migration-plan.md](./migration-plan.md#spot-done--vol-226)) into `apps/cli`
commands. The builder **shape** is the operation-builder contract in
[architecture.md](./architecture.md); this document is the migration map linking
each legacy `voltr-spot-scripts/src/scripts/*` script to the CLI command that now
replaces it.

Each CLI command is the standard "validate profile → resolve processor options →
load signer → call builder → `processOperation`" path. Transaction commands honor
`--mode` (`print` / `simulate` / `execute` / `multisig`); the one query command is
read-only and ignores `--mode`.

## Spot-specific scripts

| Legacy script | CLI command | Builder / query (`@voltr/scripts-spot`) |
| --- | --- | --- |
| `manager-initialize-spot.ts` | `spot:spot:init` | `buildSpotSpotInitOperation` |
| `manager-buy-spot.ts` | `spot:spot:buy` | `buildSpotSpotBuyOperation` |
| `manager-sell-spot.ts` | `spot:spot:sell` | `buildSpotSpotSellOperation` |
| `manager-initialize-earn.ts` (tx 1) | `spot:earn:init` | `buildSpotEarnInitOperation` |
| `manager-initialize-earn.ts` (tx 2, optional LUT) | `spot:earn:extend-lut` | `buildSpotEarnExtendLutOperation` |
| `manager-deposit-earn.ts` | `spot:earn:deposit` | `buildSpotEarnDepositOperation` |
| `manager-withdraw-earn.ts` | `spot:earn:withdraw` | `buildSpotEarnWithdrawOperation` |
| `query-strategy-positions.ts` | `spot:query:strategy-positions` | `querySpotStrategyPositions` |
| `admin-init-direct-withdraw.ts` | `spot:earn:init-direct-withdraw` | `buildSpotEarnInitDirectWithdrawOperation` |
| `admin-add-adaptor.ts` | `vault:add-adaptor --adaptor-program <SPOT_ADAPTOR_PROGRAM_ID>` | `buildAddAdaptorOperation` (generic core builder, VOL-224) |

The legacy `admin-add-adaptor.ts` is byte-for-byte the shared add-adaptor script
(only the program-id constant differs), so it maps to the generic
`vault:add-adaptor` command with the Spot adaptor program id passed as a flag —
see [adaptor-admin.md](./adaptor-admin.md). No `vault:add-adaptor` /
`vault:remove-adaptor` / `vault:init-direct-withdraw` command existed before this
ticket; all three (the shared adaptor-administration CLI surface for the VOL-224
core builders) are wired here in the `vault:*` group, with `vault:add-adaptor`
being the one the Spot migration directly needs.

## Shared scripts (already wired as `vault:*`)

The Spot fork also carried the base vault admin/user scripts. These are not
Spot-specific — they map to the shared `vault:*` commands wired in VOL-222 /
VOL-223 and need no Spot-specific work:

| Legacy script | CLI command |
| --- | --- |
| `admin-init-vault.ts` | `vault:init` |
| `admin-init-vault-and-set-token-metadata.ts` | `vault:init-and-set-token-metadata` |
| `admin-set-token-metadata.ts` | `vault:set-token-metadata` |
| `admin-update-vault-config.ts` | `vault:update-config` |
| `admin-accept-vault-admin.ts` | `vault:accept-admin` |
| `admin-harvest-fee.ts` | `vault:harvest-fee` |
| `user-deposit-vault.ts` | `vault:deposit` |
| `user-request-withdraw-vault.ts` | `vault:request-withdraw` |
| `user-cancel-request-withdraw-vault.ts` | `vault:cancel-request-withdraw` |
| `user-withdraw-vault.ts` | `vault:withdraw` |
| `user-instant-withdraw-vault.ts` | `vault:instant-withdraw` |
| `user-query-position.ts` | `vault:query:position` |

Every legacy Spot script now has a CLI command. No Spot builder/query is left
unwired.

## Where command inputs come from

Per the ticket and [architecture.md](./architecture.md#where-operational-values-live):

- **Profile fields** (`--profile`): asset mint / token program (`vault.*`); the
  foreign mint, foreign token program, and both Pyth oracle addresses
  (`integrations.spot.foreignMintAddress` / `foreignTokenProgram` /
  `assetOracleAddress` / `foreignOracleAddress`); the lookup table
  (`vault.lookupTableAddress`); and the direct-withdraw discriminator
  (`integrations.spot.directWithdrawDiscriminator`, **new** in this ticket).
- **Flags** (per call): amount (`--amount`), slippage (`--slippage-bps`), and the
  Jupiter account cap (`--jupiter-max-accounts`, default `16`), plus the optional
  `--minimum-threshold-amount-out`.
- **Role signers**: `--manager-keypair` / `--admin-keypair` (or `MANAGER_KEYPAIR`
  / `ADMIN_KEYPAIR`), never profiles.

### New profile field: `directWithdrawDiscriminator`

`spot:earn:init-direct-withdraw` needs the adaptor's 8-byte direct-withdraw
instruction discriminator. This is a per-deployment value (the legacy
`config/spot.ts` `directWithdrawDiscriminator`), not a fixed adapter constant, so
it lives in the profile:

```jsonc
"integrations": {
  "spot": {
    // …foreign mint / token program / oracle addresses…
    "directWithdrawDiscriminator": [232, 204, 244, 40, 201, 192, 7, 194]
  }
}
```

It is validated by the schema (exactly 8 bytes, each `0..255`) and read by the
new `requireSpotDirectWithdrawDiscriminator` accessor. An empty array `[]` (the
example-template placeholder) is treated as "not provided", so only profiles that
actually run direct-withdraw need to fill it in. The generic
`vault:init-direct-withdraw` command instead takes the discriminator as a
`--discriminator <8 comma-separated bytes>` flag, since it is adapter-agnostic and
has no `integrations.<adapter>` section to read from.

## Behavior-preservation notes

- **`spot:spot:sell` corrects a latent bug.** The legacy `manager-sell-spot.ts`
  passed `amountIn = 0` (and the asset→foreign direction) to its Jupiter helper,
  so it never built a swap. `buildSpotSpotSellOperation` implements the intended
  behavior — a foreign→asset swap of `amount`, symmetric with buy. (Documented in
  the builder and in [migration-plan.md](./migration-plan.md).)
- **`manager-initialize-earn.ts` was two transactions** (init strategy, then
  extend the lookup table). Per the "one builder, one operation" rule it splits
  into `spot:earn:init` and `spot:earn:extend-lut`; run the latter only when you
  use a lookup table.
- Spot/Jupiter account derivation lives entirely in `packages/spot`
  (`deriveJupiterEarnAccounts`, `findJupiterLendingPda`, `findSpotOracleInitReceiptPda`,
  `setupJupiterSwap`); the CLI commands never re-derive it, satisfying the
  acceptance criterion that commands not duplicate the operation package's logic.

# Adaptor administration (VOL-224)

Migrates the shared adapter-administration scripts — add adaptor, remove adaptor,
and direct-withdraw initialization — out of the four forked repos. Read
[architecture.md](./architecture.md) for the operation-builder contract; this
document records *where* these particular builders live and *why*.

## Decision: generic core builders, parameterized by `adaptorProgram`

The ticket offered two shapes — a generic builder in `packages/core` that accepts
`adaptorProgram`, or thin wrappers in each adapter package. **We chose generic
core builders.** Evidence:

- The three legacy `admin-add-adaptor.ts` scripts (Kamino, Spot, Trustful) are
  byte-for-byte identical except for the `ADAPTOR_PROGRAM_ID` constant they
  import. Same for the two `admin-init-direct-withdraw.ts` scripts modulo the
  strategy and discriminator.
- The instructions come from the base `@voltr/vault-sdk`
  (`getAddAdaptorInstructionAsync`, `getRemoveAdaptorInstructionAsync`,
  `getInitializeDirectWithdrawStrategyInstructionAsync`) — **not** from any
  adapter SDK. They take `adaptorProgram` (and, for direct-withdraw, `strategy` +
  `instructionDiscriminator`) as ordinary inputs.
- The architecture doc routes "vault-level (no adapter SDK)" work to
  `packages/core/src/vault/`.

So the program ID is **never hardcoded in core** — it is a builder argument. The
caller passes the adapter package's exported constant
(`KAMINO_ADAPTOR_PROGRAM_ID`, `TRUSTFUL_ADAPTOR_PROGRAM_ID`, Spot's
`ADAPTOR_PROGRAM_ID`) or a profile value. (The `TRUSTFUL_ADAPTOR_PROGRAM_ID`
doc-comment already anticipated this arrangement.)

The one genuinely adapter-specific piece is **Spot's direct-withdraw strategy
derivation** — the strategy is the Jupiter `lending` PDA, which must be derived
from the vault asset mint. That derivation lives in `packages/spot`, behind a
thin wrapper that delegates to the core builder.

## Generic vs adapter-specific

| Operation | Generic? | Where |
| --- | --- | --- |
| Add adaptor | Generic | `packages/core/src/vault/adaptor.ts` |
| Remove adaptor | Generic | `packages/core/src/vault/adaptor.ts` |
| Init direct-withdraw (instruction) | Generic | `packages/core/src/vault/adaptor.ts` |
| Kamino direct-withdraw strategy (`= kvault`) | Not derived — a profile address | core builder, called directly |
| Spot direct-withdraw strategy (`= lending` PDA) | Adapter-specific derivation | `packages/spot` wrapper → core builder |
| Trustful direct-withdraw | N/A — no legacy script exists | — |

## Builder map

| Legacy script | Builder | Label | File |
| --- | --- | --- | --- |
| `*/admin-add-adaptor.ts` (Kamino, Spot, Trustful) | `buildAddAdaptorOperation` | `vault:add-adaptor` | `core/src/vault/adaptor.ts` |
| `voltr-trustful-scripts/.../admin-remove-adaptor.ts` | `buildRemoveAdaptorOperation` | `vault:remove-adaptor` | `core/src/vault/adaptor.ts` |
| `voltr-kamino-scripts/.../admin-init-direct-withdraw.ts` | `buildInitDirectWithdrawStrategyOperation` (strategy = kvault) | `vault:init-direct-withdraw` | `core/src/vault/adaptor.ts` |
| `voltr-spot-scripts/.../admin-init-direct-withdraw.ts` | `buildSpotEarnInitDirectWithdrawOperation` → core | `spot:earn:init-direct-withdraw` | `spot/src/operations/earn.ts` |

Supporting helper extracted alongside the Spot wrapper:

- `findJupiterLendingPda({ assetMint, fTokenMint? })` in `spot/src/pda.ts` — the
  Jupiter `lending` PDA used as the Earn strategy id. `deriveJupiterEarnAccounts`
  now reuses it (and `findJupiterFTokenMintPda`) instead of inlining the seeds.

## Proposed CLI commands

CLI wiring is out of scope for VOL-224 (see the ticket). These are the proposed
command names and the inputs each needs, for the CLI ticket to wire.

| Command | Adaptor program source | Strategy source | Discriminator source |
| --- | --- | --- | --- |
| `vault:add-adaptor` | `--adaptor-program <addr>` (or adapter package constant) | — | — |
| `vault:remove-adaptor` | `--adaptor-program <addr>` | — | — |
| `vault:init-direct-withdraw` | `--adaptor-program <addr>` | `--strategy <addr>` (Kamino: kvault) | Kamino profile default, or `--discriminator <bytes>` when overriding adaptor |
| `spot:earn:init-direct-withdraw` | Spot `ADAPTOR_PROGRAM_ID` (in the wrapper) | derived `lending` PDA (in the wrapper) | profile/flag |

In all cases the **admin** signer comes from `--admin-keypair` / `ADMIN_KEYPAIR`
(via `loadRoleSigner("admin", …)`), matching the legacy `ADMIN_FILE_PATH` scripts.

### Suggested profile fields (for the CLI ticket)

The direct-withdraw discriminator is a per-deployment value (the legacy
`directWithdrawDiscriminator`, an empty placeholder operators filled in). It is
not a fixed adapter constant, so it should live in the profile, e.g.:

```jsonc
"integrations": {
  "kamino": { "kvaultAddress": "…", "directWithdrawDiscriminator": [/* 8 bytes */] },
  "spot":   { "directWithdrawDiscriminator": [/* 8 bytes */] }
}
```

Add matching `requireKaminoDirectWithdrawDiscriminator` /
`requireSpotDirectWithdrawDiscriminator` accessors to `core/src/profile.ts` when
wiring the commands. The adaptor program IDs already live in the adapter packages
(no profile field needed) but may be overridden by a `--adaptor-program` flag.

## Lookup-table behavior (deferred, like `vault:init`)

The legacy add-adaptor and init-direct-withdraw scripts optionally extended a
lookup table with the instruction's accounts in a **second** transaction. That
LUT population is multi-transaction orchestration, which the operation-builder
contract defers to the CLI/processor layer
([architecture.md](./architecture.md), rule 8) — the same deferral applied to
`buildInitVaultOperation`. The builders return only the single administration
transaction; the LUT building blocks already exist in core
(`buildExtendLookupTableInstructions`, `collectInstructionAddresses`,
`getAddressesByLookupTable`). Compiling a transaction against an *existing* LUT is
supported everywhere via the `lookupTableAddresses` passthrough.

## Reuse

`buildAddAdaptorOperation`, `buildRemoveAdaptorOperation`, and
`buildInitDirectWithdrawStrategyOperation` are exported from
`@voltr/scripts-core`. Adapter operation tickets (and the CLI) call them directly
instead of duplicating add-adaptor boilerplate, passing the adapter's program ID
constant. Only derive-then-delegate cases (Spot's `lending` strategy) warrant a
package-local wrapper.

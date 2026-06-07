# Adaptor administration

Adaptor administration is the set of vault-level operations that govern which
adaptors a vault may route through:

- **add adaptor** — register an adaptor program on a vault.
- **remove adaptor** — deregister an adaptor program.
- **init direct-withdraw** — register a direct-withdraw strategy, binding it to
  an adaptor instruction discriminator.

These are not adapter-specific: the instructions come from the base
`@voltr/vault-sdk`, and they are identical for every adaptor (Kamino, Spot,
Trustful) apart from the adaptor program ID. Read
[architecture.md](./architecture.md) for the operation-builder contract; this
document records *where* these builders live and *why*.

## Generic core builders, parameterized by `adaptorProgram`

The builders live in `packages/core/src/vault/adaptor.ts` and take
`adaptorProgram` (and, for direct-withdraw, `strategy` + an 8-byte
`instructionDiscriminator`) as ordinary inputs:

- The base `@voltr/vault-sdk` instructions (`getAddAdaptorInstructionAsync`,
  `getRemoveAdaptorInstructionAsync`,
  `getInitializeDirectWithdrawStrategyInstructionAsync`) are not tied to any
  adapter SDK.
- The architecture doc routes "vault-level (no adapter SDK)" work to
  `packages/core/src/vault/`.

So the program ID is **never hardcoded in core** — it is a builder argument. The
caller passes the adapter package's exported constant
(`KAMINO_ADAPTOR_PROGRAM_ID`, `TRUSTFUL_ADAPTOR_PROGRAM_ID`,
`SPOT_ADAPTOR_PROGRAM_ID`) or a profile value.

The one genuinely adapter-specific piece is **Spot's direct-withdraw strategy
derivation**: the strategy is the Jupiter `lending` PDA, derived from the vault
asset mint. That derivation lives in `packages/spot`, behind a thin wrapper that
delegates to the core builder.

## Generic vs adapter-specific

| Operation | Generic? | Where |
| --- | --- | --- |
| Add adaptor | Generic | `packages/core/src/vault/adaptor.ts` |
| Remove adaptor | Generic | `packages/core/src/vault/adaptor.ts` |
| Init direct-withdraw (instruction) | Generic | `packages/core/src/vault/adaptor.ts` |
| Kamino direct-withdraw strategy (`= kvault`) | Not derived — a profile address | core builder, called directly |
| Spot direct-withdraw strategy (`= lending` PDA) | Adapter-specific derivation | `packages/spot` wrapper → core builder |

## Builders

| Builder | Label | File |
| --- | --- | --- |
| `buildAddAdaptorOperation` | `vault:add-adaptor` | `core/src/vault/adaptor.ts` |
| `buildRemoveAdaptorOperation` | `vault:remove-adaptor` | `core/src/vault/adaptor.ts` |
| `buildInitDirectWithdrawStrategyOperation` | `vault:init-direct-withdraw` | `core/src/vault/adaptor.ts` |
| `buildSpotEarnInitDirectWithdrawOperation` → core | `spot:earn:init-direct-withdraw` | `spot/src/operations/earn.ts` |

Supporting helper alongside the Spot wrapper:

- `findJupiterLendingPda({ assetMint, fTokenMint? })` in `spot/src/pda.ts` — the
  Jupiter `lending` PDA used as the Earn strategy id. `deriveJupiterEarnAccounts`
  reuses it (and `findJupiterFTokenMintPda`) instead of inlining the seeds.

## CLI commands

| Command | Adaptor program source | Strategy source | Discriminator source |
| --- | --- | --- | --- |
| `vault:add-adaptor` | `--adaptor-program <addr>` (default: Kamino) | — | — |
| `vault:remove-adaptor` | `--adaptor-program <addr>` | — | — |
| `vault:init-direct-withdraw` | `--adaptor-program <addr>` (default: Kamino) | `--strategy <addr>` (default: profile Kamino kvault) | `integrations.kamino.directWithdrawDiscriminator`, or `--discriminator <bytes>` when overriding the adaptor |
| `spot:earn:init-direct-withdraw` | Spot `SPOT_ADAPTOR_PROGRAM_ID` (in the wrapper) | derived `lending` PDA (in the wrapper) | `integrations.spot.directWithdrawDiscriminator` |

In all cases the **admin** signer comes from `--admin-keypair` / `ADMIN_KEYPAIR`
(via `loadRoleSigner("admin", …)`).

### Profile fields

The direct-withdraw discriminator is a per-deployment value, not a fixed adapter
constant, so it lives in the profile:

```jsonc
"integrations": {
  "kamino": { "kvaultAddress": "…", "directWithdrawDiscriminator": [/* 8 bytes */] },
  "spot":   { "directWithdrawDiscriminator": [/* 8 bytes */] }
}
```

`requireKaminoDirectWithdrawDiscriminator` /
`requireSpotDirectWithdrawDiscriminator` (in `core/src/profile.ts`) read these.
The adaptor program IDs already live in the adapter packages (no profile field
needed) but may be overridden by `--adaptor-program`.

## Lookup-table behavior (deferred, like `vault:init`)

The add-adaptor and init-direct-withdraw builders return only the single
administration transaction. Optionally extending a lookup table with the
instruction's accounts is multi-transaction orchestration, which the
operation-builder contract defers to the CLI/processor layer
([architecture.md](./architecture.md) rule 8) — the same deferral as
`buildInitVaultOperation`. The building blocks live in core
(`buildExtendLookupTableInstructions`, `collectInstructionAddresses`,
`getAddressesByLookupTable`). Compiling a transaction against an *existing* LUT is
supported everywhere via the `lookupTableAddresses` passthrough.

## Reuse

`buildAddAdaptorOperation`, `buildRemoveAdaptorOperation`, and
`buildInitDirectWithdrawStrategyOperation` are exported from
`@voltr/scripts-core`. Adapters and the CLI call them directly instead of
duplicating add-adaptor boilerplate, passing the adapter's program ID constant.
Only derive-then-delegate cases (Spot's `lending` strategy) warrant a
package-local wrapper.

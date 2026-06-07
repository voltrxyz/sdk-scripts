# Adaptor administration

Adaptor administration is the set of vault-level operations that govern which
adaptors a vault may route through, and is identical for every adaptor (Kamino,
Spot, Trustful) apart from the adaptor program ID:

- **add adaptor** (`vault:add-adaptor`) — register an adaptor program on a vault.
- **remove adaptor** (`vault:remove-adaptor`) — deregister an adaptor program.
- **init direct-withdraw** (`vault:init-direct-withdraw`) — register a
  direct-withdraw strategy, binding it to an adaptor instruction discriminator.

These are admin-signed, one-time setup steps. For runnable examples, see the
operator guide's [Add an adapter](./operator-guide.md#add-an-adapter); run `pnpm
cli -- <command> --help` for exact flags.

## Where each input comes from

| Command | Adaptor program | Strategy | Discriminator |
| --- | --- | --- | --- |
| `vault:add-adaptor` | `--adaptor-program <addr>` (default: Kamino) | — | — |
| `vault:remove-adaptor` | `--adaptor-program <addr>` | — | — |
| `vault:init-direct-withdraw` | `--adaptor-program <addr>` (default: Kamino) | `--strategy <addr>` (default: profile Kamino kvault) | `integrations.kamino.directWithdrawDiscriminator`, or `--discriminator <bytes>` when overriding the adaptor |
| `spot:earn:init-direct-withdraw` | Spot adaptor (built in) | derived Jupiter `lending` PDA (built in) | `integrations.spot.directWithdrawDiscriminator` |

In all cases the **admin** signer comes from `--admin-keypair` / `ADMIN_KEYPAIR`.
The adaptor program IDs ship with the CLI, so `--adaptor-program` only needs to
be passed to override the Kamino default (the Spot and Trustful program IDs are
documented in [spot.md](./spot.md) and [trustful.md](./trustful.md)).

The one genuinely adapter-specific case is **Spot's direct-withdraw strategy**:
its strategy is the Jupiter `lending` PDA derived from the vault asset mint, so
use the dedicated `spot:earn:init-direct-withdraw` (it derives the strategy and
supplies the Spot adaptor for you) rather than the generic command.

## Profile fields

The direct-withdraw discriminator is a per-deployment value, not a fixed adapter
constant, so it lives in the profile:

```jsonc
"integrations": {
  "kamino": { "kvaultAddress": "…", "directWithdrawDiscriminator": [/* 8 bytes */] },
  "spot":   { "directWithdrawDiscriminator": [/* 8 bytes */] }
}
```

An empty array `[]` is treated as "not provided"; only fill it in for a vault
that actually runs direct-withdraw.

## Lookup-table behavior

`vault:add-adaptor` and `vault:init-direct-withdraw` build only the single
administration transaction. If the vault uses a lookup table, pre-load it as a
separate step. Compiling a transaction against an *existing* lookup table is
supported via the profile's `lookupTableAddress`.

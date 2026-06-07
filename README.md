# Voltr Integration Scripts

A single command-line tool for operating Voltr vaults and their protocol
integrations. Every operation — vault setup, deposits/withdrawals, and each
supported strategy — is one `<group>:<action>` command driven by a JSON
**profile** (the vault's addresses) and **flags** (per-call values such as
amounts and signer paths). Source files are never edited to change runtime
values.

- **One CLI** (`apps/cli`) exposes every operation as a `<group>:<action>` command.
- **Shared vault behavior** — signers, RPC, token accounts, lookup tables, and
  transaction modes — lives in `packages/core`.
- **Each integration** (Kamino, Spot, Trustful) is an adapter package that owns
  only its protocol-specific account derivation and instruction building.

## Install

```bash
pnpm install
```

## First run

Validate the bundled example profile. This is fully offline — no RPC, no
keypair, and no deployed vault — and is the quickest way to confirm your
checkout works:

```bash
pnpm cli -- --profile configs/examples/usdc.mainnet.example.json check
```

> `pnpm cli -- <args>`: the leading `--` separates pnpm's own arguments from the
> CLI's. The CLI strips it automatically, so the flags after it (`--profile`,
> `--mode`, …) are parsed normally. Repository-relative `--profile` and
> `--*-keypair` paths resolve from the directory you run `pnpm cli` in (the
> repository root).

To operate a real vault, create a profile and initialize the vault before
running any vault operation:

```bash
# 1. Copy the example, then edit configs/my-vault.json: set
#    vault.assetMintAddress and vault.assetTokenProgram. Leave
#    vault.vaultAddress empty — vault:init generates it.
cp configs/examples/usdc.mainnet.example.json configs/my-vault.json

# 2. Validate the edited profile (offline):
pnpm cli -- --profile configs/my-vault.json check

# 3. Initialize the vault. The admin signs; the manager is just an address. A
#    fresh vault address is generated and printed. (Needs a reachable RPC and the
#    admin keypair — see the operator guide for --rpc-url and the env vars.)
RPC_URL="https://your-rpc" ADMIN_KEYPAIR=/path/to/admin.json pnpm cli -- \
  --profile configs/my-vault.json --mode execute \
  vault:init --manager <MANAGER_PUBKEY> --name "My USDC Vault" --max-cap 100000000000

# 4. Record the printed "Generated vault address" as vault.vaultAddress in
#    configs/my-vault.json.

# 5. Only now, with vault.vaultAddress set, run vault operations — e.g. deposit:
RPC_URL="https://your-rpc" USER_KEYPAIR=/path/to/user.json pnpm cli -- \
  --profile configs/my-vault.json --mode execute \
  vault:deposit --amount 1000000
```

> Only `check` is fully offline. Every transaction command builds against live
> chain state, so a reachable RPC is required **even for `--mode print`**. Always
> preview with `--mode print` (then `--mode simulate`) before `--mode execute`.
> See the operator guide's
> [transaction modes](./docs/operator-guide.md#2-transaction-modes--verify-before-you-execute).

## Supported integrations

| Integration | Command groups | Reference |
| --- | --- | --- |
| Voltr vault (core) | `vault:*` | [operator guide](./docs/operator-guide.md) |
| Kamino | `kamino:market:*`, `kamino:kvault:*` | [docs/kamino.md](./docs/kamino.md) |
| Spot (Jupiter swap + Earn) | `spot:swap:*`, `spot:earn:*` | [docs/spot.md](./docs/spot.md) |
| Trustful | `trustful:arbitrary:*`, `trustful:curve:*` | [docs/trustful.md](./docs/trustful.md) |
| Adaptor administration | `vault:add-adaptor`, `vault:init-direct-withdraw`, … | [docs/adaptor-admin.md](./docs/adaptor-admin.md) |

## Documentation

**Vault managers start here:**

- **[docs/operator-guide.md](./docs/operator-guide.md)** — the canonical
  vault-manager guide: profile creation, keypair/role handling, RPC, transaction
  modes (`print` / `simulate` / `multisig` / `execute`), and runnable end-to-end
  workflows for every supported flow.
- Per-integration references — integration-specific setup, required profile
  fields, and operational constraints: [Kamino](./docs/kamino.md),
  [Spot](./docs/spot.md), [Trustful](./docs/trustful.md), and
  [adaptor administration](./docs/adaptor-admin.md).

**Developers embedding the packages (SDK consumers):**

- **[examples/README.md](./examples/README.md)** — runnable TypeScript examples
  for calling the operation builders and queries directly from your own code,
  inspecting a `BuiltOperation`, and routing it through the shared transaction
  processor. One file per action; browse them with `pnpm examples:list` and run
  any with no arguments, e.g. `pnpm exec tsx examples/src/vault/deposit.ts` (or
  `pnpm example -- vault:deposit`). This is the programmatic path; the CLI above
  remains the primary interface for routine vault-manager operations.

**Contributors:**

- **[docs/architecture.md](./docs/architecture.md)** — package responsibilities,
  the operation-builder contract, command naming, the web3.js compatibility
  boundary, and the recipe for adding a new operation or integration.
- **[docs/testing.md](./docs/testing.md)** — the offline checks (`pnpm check`),
  how to add an adapter builder test, and the examples-workspace checks.

## Discovering commands

The CLI itself is the authoritative reference for the command surface and every
flag:

```bash
pnpm cli -- --help                 # global options + all command groups
pnpm cli -- vault:deposit --help   # flags for a single command
```

Commands are grouped by `<group>:*` prefix (`vault:`, `kamino:`, `spot:`,
`trustful:`, plus the maintenance command `check`). Every command takes the
global options (`--profile`, `--rpc-url`, `--mode`, priority-fee flags); the
[operator guide](./docs/operator-guide.md) explains what each option does and
walks through the common workflows.

# Voltr Integration Scripts

Workspace for shared Voltr vault scripts plus thin adapter-specific integrations.

This repo replaces the fork-per-integration shape used by:

- `/Users/shayn/Desktop/voltr/voltr-base-scripts`
- `/Users/shayn/Desktop/voltr/voltr-trustful-scripts`
- `/Users/shayn/Desktop/voltr/voltr-kamino-scripts`
- `/Users/shayn/Desktop/voltr/voltr-spot-scripts`

Those repos remain on disk as **migration references only** — do not edit them for ongoing operations.

Common vault, signer, token-account, LUT, and transaction behavior lives in `packages/core`. Each adapter package owns only its protocol-specific account derivation and instruction builders.

## Layout

```text
apps/
  cli/                 # User-facing command runner
    src/
      index.ts         # thin entry: wires global options + command groups
      lib/             # globals, role signers, output, error helpers
      commands/        # one module per command group (vault, kamino, …)
packages/
  core/                # Shared env, signer, tx, LUT, token, vault helpers
  kamino/              # Kamino-specific operation builders
  spot/                # Spot/Jupiter-specific operation builders
  trustful/            # Trustful-specific operation builders
configs/
  examples/            # JSON profile examples
docs/
  architecture.md      # Package responsibilities + operation-builder contract
  migration-plan.md    # Migration order from the old repos
```

## Documentation

- **[docs/architecture.md](./docs/architecture.md)** — read this first. Defines package responsibilities, the operation-builder contract, command naming, query vs transaction commands, web3.js isolation, where operational values live, and the step-by-step recipe for adding a new operation.
- **[docs/migration-plan.md](./docs/migration-plan.md)** — which legacy scripts to port, in what order.
- **[docs/testing.md](./docs/testing.md)** — the offline checks (`pnpm typecheck`, `pnpm test`, `pnpm check`) to run before opening a PR, and how to add adapter builder tests.
- **[docs/testing.md](./docs/testing.md)** — the offline checks (`pnpm typecheck`, `pnpm test`, `pnpm check`) to run before opening a PR, and how to add adapter builder tests.

## First commands

Install dependencies:

```bash
pnpm install
```

Print a vault deposit transaction plan:

```bash
pnpm cli -- \
  --profile configs/examples/usdc.mainnet.example.json \
  --mode print \
  vault:deposit \
  --user-keypair /path/to/user.json \
  --amount 1000000
```

Execute it:

```bash
RPC_URL="https://your-rpc" pnpm cli -- \
  --profile configs/examples/usdc.mainnet.example.json \
  --mode execute \
  vault:deposit \
  --user-keypair /path/to/user.json \
  --amount 1000000
```

> When invoked as `pnpm cli -- <args>`, the leading `--` separates pnpm's own
> arguments from the CLI's. The CLI strips it automatically, so the flags after
> it (`--profile`, `--mode`, …) are parsed normally.

## Commands

Discover everything from the CLI itself:

```bash
pnpm cli -- --help                 # global options + all command groups
pnpm cli -- vault:deposit --help   # flags for a single command
```

Commands are grouped by `<group>:*` prefixes. Every command takes the
[global options](#global-options) (`--profile`, `--rpc-url`, `--mode`, priority
fee, …); the per-command flags below are the values that are not read from the
profile.

| Group        | What it covers                          | Example command |
| ------------ | --------------------------------------- | --------------- |
| `vault:*`    | shared Voltr vault operations           | `vault:deposit` |
| `kamino:*`   | Kamino market / kvault strategies       | `kamino:market:deposit` |
| `spot:*`     | Spot / Earn strategies                  | `spot:spot:buy` |
| `trustful:*` | Trustful arbitrary / curve strategies   | `trustful:curve:borrow` |
| `check`      | validate a profile (maintenance)        | `check` |

One example per group (all default to `--mode print`, so they build a plan
without sending anything):

```bash
# vault: deposit the profile asset into the vault
pnpm cli -- --profile configs/my-vault.json \
  vault:deposit --amount 1000000

# kamino: deposit into a Kamino lending market
pnpm cli -- --profile configs/my-vault.json \
  kamino:market:deposit --amount 1000000

# spot: buy the foreign asset via a spot swap
pnpm cli -- --profile configs/my-vault.json \
  spot:spot:buy --amount 1000000 --slippage-bps 50

# trustful: borrow against a curve strategy
pnpm cli -- --profile configs/my-vault.json \
  trustful:curve:borrow --amount 1000000

# check: validate a profile and print a configuration summary (no network)
pnpm cli -- --profile configs/my-vault.json check
```

The `vault:*`, `spot:*`, and `trustful:*` builders are migrated. The
`kamino:market:deposit` builder is migrated too, but it is imported lazily:
`@kamino-finance/klend-sdk` currently has an unresolved transitive dependency,
so the import is deferred into the command's action. That keeps the rest of the
CLI — every `vault:*` command and `--help` — working; only `kamino:market:deposit`
surfaces the dependency error, and only when it is actually run.

### Vault commands

Every `vault:*` operation is listed below. All are transaction commands (they
honor `--mode`) except the two `vault:query:*` commands, which are read-only:
they ignore `--mode` and need no keypair. Profile-sourced values (vault address,
asset mint, asset token program, lookup table) come from `--profile`; the flags
below are the per-call values.

| Command | Role | Per-call flags |
| --- | --- | --- |
| `vault:init` | admin | `--manager`, `--name`, `--max-cap` (+ optional fee/duration flags, default `0`) |
| `vault:init-and-set-token-metadata` | admin | init flags above + `--metadata-name`, `--metadata-symbol`, `--metadata-uri` |
| `vault:set-token-metadata` | admin | `--metadata-name`, `--metadata-symbol`, `--metadata-uri` |
| `vault:update-config` | admin | `--field <name>`, `--value <raw\|address>` |
| `vault:accept-admin` | admin (pending) | — |
| `vault:harvest-fee` | admin | `--manager <address>` |
| `vault:deposit` | user | `--amount <raw>` |
| `vault:request-withdraw` | user | `--amount <raw>`, `--in-lp`, `--all` |
| `vault:cancel-request-withdraw` | user | — |
| `vault:withdraw` | user | — |
| `vault:instant-withdraw` | user | `--amount <raw>`, `--in-lp`, `--all` |
| `vault:query:position` | none | `--user <address>` |
| `vault:query:strategy-positions` | none | — |

Role keypairs come from `--<role>-keypair` or the `<ROLE>_KEYPAIR` env var (see
[Keypairs](#keypairs)). `vault:init` does **not** need the manager's keypair —
only its address via `--manager`, because the manager does not sign
initialization. A fresh vault keypair is generated for each `vault:init*` run
and its address is printed; record it as `vault.vaultAddress` in your profile
after a successful `--mode execute`. Because that generated keypair must sign
initialization, the `vault:init*` commands do **not** support `--mode multisig`
(a multisig payload can't carry the ephemeral keypair's signature) and reject it
with a clear error — use `--mode execute`.

`vault:update-config` updates one field per call. Run `vault:update-config
--help` for the full field list; numeric fields take a raw-integer `--value`,
while `manager` / `pending-admin` take a base58 address. `--in-lp` makes
`--amount` an LP-token amount; `--all` withdraws the entire position.

#### Vault lifecycle flow

The new-CLI equivalent of the old `voltr-base-scripts` "Basic Usage Flow"
(editing `config/base.ts` before each run is replaced by a profile + flags):

```bash
# 1. Create a profile for the vault asset (copy an example, then edit it):
cp configs/examples/usdc.mainnet.example.json configs/my-vault.json
# set vault.assetMintAddress / vault.assetTokenProgram in configs/my-vault.json

# 2. Initialize the vault (admin signs; manager is just an address). Preview the
#    plan with --mode print, then --mode execute. The vault address is printed.
RPC_URL="https://your-rpc" ADMIN_KEYPAIR=/path/admin.json pnpm cli -- \
  --profile configs/my-vault.json --mode execute \
  vault:init --manager <MANAGER_PUBKEY> --name "My USDC Vault" --max-cap 100000000000

# 3. Record the printed "Generated vault address" as vault.vaultAddress in
#    configs/my-vault.json.

# 4. (optional) Update a config field later:
RPC_URL="https://your-rpc" ADMIN_KEYPAIR=/path/admin.json pnpm cli -- \
  --profile configs/my-vault.json --mode execute \
  vault:update-config --field max-cap --value 200000000000

# 5. Deposit as a user:
RPC_URL="https://your-rpc" USER_KEYPAIR=/path/user.json pnpm cli -- \
  --profile configs/my-vault.json --mode execute \
  vault:deposit --amount 1000000

# 6. Check the position (read-only, no keypair):
RPC_URL="https://your-rpc" pnpm cli -- \
  --profile configs/my-vault.json \
  vault:query:position --user <USER_PUBKEY>

# 7. Withdraw — request then claim after any waiting period, or instant-withdraw:
RPC_URL="https://your-rpc" USER_KEYPAIR=/path/user.json pnpm cli -- \
  --profile configs/my-vault.json --mode execute \
  vault:request-withdraw --amount 1000000
RPC_URL="https://your-rpc" USER_KEYPAIR=/path/user.json pnpm cli -- \
  --profile configs/my-vault.json --mode execute \
  vault:withdraw
```

### Global options

| Option | Purpose |
| ------ | ------- |
| `--profile <path>` | JSON profile to load (required). |
| `--rpc-url <url>` | RPC override; see [RPC URL](#rpc-url) precedence. |
| `--mode <mode>` | `print` (default), `simulate`, `multisig`, or `execute`. |
| `--multisig-address <pubkey>` | Vault PDA that signs on-chain; required for `--mode multisig`. |
| `--priority-fee <kind>` | `helius` (default), `rpc`, `fixed`, or `none`. |
| `--priority-fee-micro-lamports <n>` | microLamports for `--priority-fee fixed` (or a fallback). |
| `--compute-unit-limit <n>` | Override the estimated compute-unit limit. |

Transaction commands honor `--mode`; `check` ignores it (it never builds a
transaction). See [docs/architecture.md](./docs/architecture.md) for how
`--mode` is dispatched by `processOperation`.

## Checks before opening a PR

All checks are offline — no RPC URL, no keypair files, no build step:

```bash
pnpm typecheck   # type-checks every package + app, including test files
pnpm test        # runs all *.test.ts with the Node test runner
pnpm check       # typecheck + build + test (the CI-ready gate)
```

Run `pnpm check` before opening a PR. See **[docs/testing.md](./docs/testing.md)**
for what is covered, the offline guarantee, and how to add a builder test for a
newly migrated operation.

## Profiles

A profile is a JSON file that describes one vault deployment: which cluster it lives on, which asset it holds, optional lookup table, and any integration-specific addresses the vault uses.

Profiles are validated with zod when loaded. If a field is missing or malformed, the CLI fails before any RPC call or transaction is built, and the error names the offending field.

Profile shape:

```jsonc
{
  "name": "usdc-mainnet-example",       // required, non-empty
  "cluster": "mainnet-beta",            // required: localnet | devnet | mainnet-beta
  "rpcUrl": "",                         // optional fallback RPC; CLI/env override below
  "vault": {
    "name": "USDC",                     // optional display label
    "assetMintAddress": "...",          // required, base58
    "assetTokenProgram": "...",         // required, base58 (Token or Token-2022 program)
    "vaultAddress": "...",              // required by vault:* commands
    "useLookupTable": false,            // optional, defaults to false
    "lookupTableAddress": "..."         // required when useLookupTable is true
  },
  "integrations": {
    "kamino":   { "reserveAddress": "...", "kvaultAddress": "..." },
    "spot":     { "foreignMintAddress": "...", "foreignTokenProgram": "...", "assetOracleAddress": "...", "foreignOracleAddress": "..." },
    "trustful": { "strategySeedString": "..." }
  }
}
```

Notes:

- Empty strings are treated as "not provided"; per-command accessors decide whether a missing field is fatal for that command.
- No keypair paths or secret material live in profiles. Keypairs come from `--user-keypair` (and similar) CLI flags or env vars.
- Amounts come from CLI flags (e.g. `--amount`), not from the profile.

To create a new profile, copy an example file into `configs/` (the workspace ignores nothing here by default — make sure it is not committed if it references real production addresses you don't want in git):

```bash
cp configs/examples/usdc.mainnet.example.json configs/my-vault.json
# edit configs/my-vault.json: fill in vault.vaultAddress, optional LUT, integration sections
```

## Overrides

### RPC URL

Resolved in this order (first non-empty wins):

1. `--rpc-url <url>` CLI flag
2. `RPC_URL` env var
3. `HELIUS_RPC_URL` env var
4. `rpcUrl` field in the profile

If none of those provide a URL, the CLI exits with an error before doing any work.

### Keypairs

Commands sign as one of three roles. Each role resolves its keypair path from a
flag, falling back to an environment variable (set them in `.env`):

| Role      | Flag                  | Env var           |
| --------- | --------------------- | ----------------- |
| `admin`   | `--admin-keypair`     | `ADMIN_KEYPAIR`   |
| `manager` | `--manager-keypair`   | `MANAGER_KEYPAIR` |
| `user`    | `--user-keypair`      | `USER_KEYPAIR`    |

Paths point to standard Solana JSON keypair files. The flag wins when both are
present; if neither is set, the command fails before doing any work with a
message naming both the flag and the env var. No keypair material lives in
profiles.

```bash
# Explicit flag:
RPC_URL="https://your-rpc" pnpm cli -- \
  --profile configs/my-vault.json --mode execute \
  vault:deposit --user-keypair /path/to/user.json --amount 1000000

# Or via env var, no flag needed:
RPC_URL="https://your-rpc" USER_KEYPAIR=/path/to/user.json pnpm cli -- \
  --profile configs/my-vault.json --mode execute \
  vault:deposit --amount 1000000
```

## Design rules (summary)

The full rules live in [docs/architecture.md](./docs/architecture.md). The short version:

- Operation builders return a `BuiltOperation` (`label`, `instructions`, optional `lookupTableAddresses`, optional `computeUnitLimit`). They do not read files, parse CLI flags, send transactions, or read `ctx.profile`.
- CLI commands parse argv, load signers and profiles, coerce values, call the builder, and hand the result to `processOperation`.
- Routine operational values (vault address, asset mint, LUTs, strategy seeds) live in JSON profiles under `configs/`. Per-call values (amounts, signer paths, slippage) come from CLI flags. TypeScript source files are not edited to change runtime values.
- `packages/core` owns signer/RPC/LUT/send behavior and must not depend on `@solana/web3.js`. Adapter packages that depend on legacy SDKs convert at the boundary using `packages/core/src/interop/web3-kit.ts`; no web3.js type escapes a builder.
- New execution modes (`simulate`, `multisig`) are added once in `packages/core/src/tx/processor.ts`, not per adapter.
- Adapter packages do not import each other; Kamino, Spot, and Trustful migrations are independent workstreams.

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

Each command takes an explicit `--*-keypair <path>` flag (for example `--user-keypair`). Paths point to standard Solana JSON keypair files. Environment variables like `USER_KEYPAIR` may be set in `.env` to populate shell-level shorthand:

```bash
RPC_URL="https://your-rpc" USER_KEYPAIR=/path/to/user.json pnpm cli -- \
  --profile configs/my-vault.json \
  --mode execute \
  vault:deposit \
  --user-keypair "$USER_KEYPAIR" \
  --amount 1000000
```

## Design rules (summary)

The full rules live in [docs/architecture.md](./docs/architecture.md). The short version:

- Operation builders return a `BuiltOperation` (`label`, `instructions`, optional `lookupTableAddresses`, optional `computeUnitLimit`). They do not read files, parse CLI flags, send transactions, or read `ctx.profile`.
- CLI commands parse argv, load signers and profiles, coerce values, call the builder, and hand the result to `processOperation`.
- Routine operational values (vault address, asset mint, LUTs, strategy seeds) live in JSON profiles under `configs/`. Per-call values (amounts, signer paths, slippage) come from CLI flags. TypeScript source files are not edited to change runtime values.
- `packages/core` owns signer/RPC/LUT/send behavior and must not depend on `@solana/web3.js`. Adapter packages that depend on legacy SDKs convert at the boundary using `packages/core/src/interop/web3-kit.ts`; no web3.js type escapes a builder.
- New execution modes (`simulate`, `multisig`) are added once in `packages/core/src/tx/processor.ts`, not per adapter.
- Adapter packages do not import each other; Kamino, Spot, and Trustful migrations are independent workstreams.

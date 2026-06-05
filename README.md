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

## First commands

Install dependencies:

```bash
pnpm install
```

Print a vault deposit transaction plan:

```bash
pnpm cli -- \
  --profile configs/examples/ranger-usd.mainnet.example.json \
  --mode print \
  vault:deposit \
  --user-keypair /path/to/user.json \
  --amount 1000000
```

Execute it:

```bash
RPC_URL="https://your-rpc" pnpm cli -- \
  --profile configs/examples/ranger-usd.mainnet.example.json \
  --mode execute \
  vault:deposit \
  --user-keypair /path/to/user.json \
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

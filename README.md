# Voltr Integration Scripts

Workspace for shared Voltr vault scripts plus thin adapter-specific integrations.

This repo is intended to replace the current fork-per-integration shape:

- `voltr-base-scripts`
- `voltr-trustful-scripts`
- `voltr-kamino-scripts`
- `voltr-spot-scripts`

The goal is to keep common vault, signer, token-account, LUT, and transaction behavior in one package, while each integration only owns its protocol-specific account derivation and instruction builders.

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
  migration-plan.md    # Suggested migration order from the old repos
```

## First Commands

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

## Design Rules

- Operation builders return instructions; they do not read files, parse CLI flags, or send transactions.
- CLI commands parse user input and call operation builders.
- Profiles are JSON data, not TypeScript source edits.
- `packages/core` owns signer/RPC/LUT/send behavior.
- Adapter packages own only adapter-specific account derivation and remaining-account ordering.
- New execution modes such as `simulate` and `multisig` should be added once in `packages/core/src/tx/processor.ts`.


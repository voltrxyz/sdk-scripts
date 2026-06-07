# Testing and automated checks

This repo ships lightweight, **offline** checks so a change can be verified
without a live RPC, keypair files, or mainnet execution. Run them before
opening a PR.

## Commands

Run from the repo root:

| Command          | What it does                                                                 | Needs build? | Network? |
| ---------------- | --------------------------------------------------------------------------- | ------------ | -------- |
| `pnpm typecheck` | Type-checks every package, app, the examples, **and the test files**.       | no           | no       |
| `pnpm test`      | Runs all `*.test.ts` with the Node test runner.                             | no           | no       |
| `pnpm build`     | Compiles every package to `dist/` (topological order).                      | —            | no       |
| `pnpm examples:check` | Typechecks the examples + runs offline runtime checks (help/registry/safety/build). | no | no |
| `pnpm examples:list` | Prints the example catalog (group, role, network, purpose).           | no           | no       |
| `pnpm check`     | `typecheck` → `build` → `test` → `examples:check`. The CI-ready gate.       | —            | no       |
| `pnpm cli -- …`  | Runs the CLI straight from source.                                          | no           | depends¹ |
| `pnpm example -- <name>` | Runs a programmatic example by name (or `pnpm exec tsx <file>`).      | no           | depends¹ |

¹ `--mode execute`/`simulate` always touch the network; `--mode print` /
`--mode multisig` are offline. Examples default to `print`; some example builders
still read accounts in `print` — see [examples/README.md](../examples/README.md).

**Before opening a PR, run `pnpm check`** (or, for a faster inner loop,
`pnpm typecheck && pnpm test`).

## Examples-workspace check

The `examples/` workspace (runnable programmatic examples — see
[examples/README.md](../examples/README.md)) is verified by `pnpm examples:check`,
which is part of `pnpm check`. It runs two offline stages:

1. **`tsc -p examples/tsconfig.json`** — maps `@voltr/scripts-*` to **source**, so
   the examples type-check against the actual exported APIs with no build. This is
   the guard that catches drift between an example and a package's public surface.
2. **`tsx examples/scripts/check.ts`** — offline runtime checks: the registry has
   unique names resolving to real modules; every example renders `--help` with no
   network or keypair; transaction examples default to `print` (none default to
   `execute`); offline-capable examples build a valid `BuiltOperation` against a
   fake RPC + generated signers (`assertBuiltOperationShape`); and no example
   source contains hard-coded keypair material or absolute developer paths.

Examples resolve the workspace packages to source the same way the CLI does: the
repo-root [`tsconfig.json`](../tsconfig.json) supplies the `paths` mapping `tsx`
auto-discovers, so bare `pnpm exec tsx examples/src/<group>/<file>.ts` (and
`pnpm example` / `pnpm examples:list`) run from source with no build — only
`pnpm install` is needed.

### How examples run, and the network boundary

Each example is one file per action, run directly (`pnpm exec tsx <file>`) or by
name (`pnpm example -- <name>`). Config comes from flags (`--profile`, `--mode`,
`--rpc-url`, `--multisig-address`, `--yes`) or the equivalent env vars
(`VOLTR_PROFILE`, `VOLTR_MODE`, `RPC_URL`, `VOLTR_MULTISIG_ADDRESS`,
`VOLTR_CONFIRM`) — a flag overrides its env var; both fall back to defaults so a
bare run works. Keypairs come from `<ROLE>_KEYPAIR`. They default to `print` and
gate `execute` behind a confirmation (`--yes` / `VOLTR_CONFIRM=1`).

The runtime check above only exercises offline builders (fake RPC, generated
signers). Actually running an example needs a configured profile + RPC (and a
keypair for transaction examples); some builders decode on-chain state or call
Jupiter even in `print`, so they need a working RPC to preview. `--mode execute`,
a live Jupiter swap, and the Kamino market/kvault flows are exercised manually,
not by `pnpm check`.

## Everything offline runs from source — no build step

Workspace packages are published to their consumers as `dist/`, which would
normally force a build before anything could resolve them. To keep checks
build-free, the root [`tsconfig.check.json`](../tsconfig.check.json) maps the
packages (including `@voltr/scripts-core/testing`) to their **source**:

- `tsc -p tsconfig.check.json` type-checks the whole workspace against source.
- The same config is handed to `tsx` at runtime via `TSX_TSCONFIG_PATH` (see the
  root `test` and the CLI `dev` scripts), so tests and `pnpm cli` also run from
  source.

The per-package `tsconfig.json` files remain the **build** configs — they keep
`rootDir`/`outDir` and resolve workspace packages to `dist/`. Only `pnpm build`
uses them.

## Offline guarantee

Every test is offline by design:

- RPC reads are stubbed with `createFakeRpc` — no `RPC_URL`, no live node.
- Signers come from `generateKeyPairSigner()` (in-memory) — no keypair files.
- Profiles are built in-memory or written to a temp dir — no real `configs/`.

So the checks never read `RPC_URL`, `HELIUS_RPC_URL`, `.env`, or any `--*-keypair`
file. `createScriptContext`'s RPC-precedence test sets and restores
`process.env` itself.

### What the checks intentionally do **not** cover

These need live infrastructure and are out of scope for automated checks:

- `--mode execute` (sends and confirms a real transaction).
- `--mode simulate` against a real RPC.
- Anything that loads a real keypair file or dials a real RPC URL.

To exercise those manually you need an `RPC_URL` (or `HELIUS_RPC_URL`) and a
keypair file passed via the relevant `--*-keypair` flag. See the root
[README](../README.md).

## Where tests live

- Co-locate tests next to the code as `*.test.ts` (e.g.
  `src/tx/processor.test.ts`).
- They are excluded from `dist/` by each build `tsconfig.json` and auto-discovered
  by the root `test` script (`packages/*/src/**/*.test.ts` and
  `apps/*/src/**/*.test.ts`) — no per-package wiring needed. Drop a file in and it
  runs.

Current coverage:

| Area                         | File                                          |
| ---------------------------- | --------------------------------------------- |
| Profile validation + access  | `packages/core/src/profile.test.ts`           |
| Amount parsing + env/context | `packages/core/src/env.test.ts`               |
| Tx processor mode dispatch   | `packages/core/src/tx/processor.test.ts`      |
| Vault builder output shape   | `packages/core/src/vault/operations.test.ts`  |
| CLI help/argument validation | `apps/cli/src/index.test.ts`                  |
| Adapter builder smoke tests  | `packages/{kamino,spot,trustful}/src/operations/*.test.ts` |
| Examples workspace (offline) | `examples/scripts/check.ts` + `examples/tsconfig.json` (`pnpm examples:check`) |

## Adding an adapter builder test

Test helpers live in `@voltr/scripts-core/testing`:

- `createFakeScriptContext(opts?)` — a `ScriptContext` backed by a no-network
  fake RPC. (Builders must not read `ctx.profile`, so its values don't matter.)
- `createFakeRpc(opts?)` — the fake RPC on its own; pass `existingAccounts` or a
  custom `getAccountInfo` to control account-existence checks.
- `assertBuiltOperationShape(op, { label?, minInstructions? })` — asserts the
  `BuiltOperation` contract (non-empty label, well-formed kit instructions,
  correctly-typed optional fields).

Each adapter builder should have an offline smoke test that asserts its output
shape:

```ts
import { test } from "node:test";
import { generateKeyPairSigner } from "@solana/kit";
import {
  createFakeScriptContext,
  assertBuiltOperationShape,
} from "@voltr/scripts-core/testing";
import { buildKaminoKvaultInitOperation } from "./kvault.js";

test("kamino:kvault:init builds the expected operation", async () => {
  const ctx = createFakeScriptContext();
  const manager = await generateKeyPairSigner();

  const operation = await buildKaminoKvaultInitOperation(ctx, {
    manager,
    /* …kit-typed args… */
  });

  assertBuiltOperationShape(operation, {
    label: "kamino:kvault:init",
    minInstructions: 1,
  });
});
```

If a builder needs an RPC read the fake doesn't implement yet, extend
`createFakeRpc` in `packages/core/src/testing.ts` (keep it offline) rather than
reaching for a live RPC in a test.

# Testing and automated checks

This repo ships lightweight, **offline** checks so a migration agent can verify a
change without a live RPC, keypair files, or mainnet execution. Run them before
opening a PR.

## Commands

Run from the repo root:

| Command          | What it does                                                                 | Needs build? | Network? |
| ---------------- | --------------------------------------------------------------------------- | ------------ | -------- |
| `pnpm typecheck` | Type-checks every package + app **and the test files**, in one pass.        | no           | no       |
| `pnpm test`      | Runs all `*.test.ts` with the Node test runner (`node:test`).               | no           | no       |
| `pnpm build`     | Compiles every package to `dist/` (topological order).                      | —            | no       |
| `pnpm check`     | `typecheck` → `build` → `test`. The CI-ready gate.                          | —            | no       |
| `pnpm cli -- …`  | Runs the CLI straight from source.                                          | no           | depends¹ |

¹ The CLI itself only touches the network in `--mode execute`/`simulate`.
`--mode print` and `--mode multisig` are fully offline.

**Before opening a PR, run `pnpm check`** (or, for a faster inner loop,
`pnpm typecheck && pnpm test`).

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

These need live infrastructure and are out of scope for automated checks (see
VOL-231 "Out of Scope"):

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

## Adding an adapter builder test

Test helpers live in `@voltr/scripts-core/testing`:

- `createFakeScriptContext(opts?)` — a `ScriptContext` backed by a no-network
  fake RPC. (Builders must not read `ctx.profile`, so its values don't matter.)
- `createFakeRpc(opts?)` — the fake RPC on its own; pass `existingAccounts` or a
  custom `getAccountInfo` to control account-existence checks.
- `assertBuiltOperationShape(op, { label?, minInstructions? })` — asserts the
  `BuiltOperation` contract (non-empty label, well-formed kit instructions,
  correctly-typed optional fields).

Each adapter builder should have an offline smoke test. For not-yet-migrated
builders, assert that the stub rejects clearly. When you implement a builder,
swap the stub assertion for an output-shape check:

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

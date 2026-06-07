# Release validation — sdk-scripts — 2026-06-07

Final release-readiness validation of **sdk-scripts** (the canonical, standalone
Voltr integration scripting product) per VOL-233.

| | |
| --- | --- |
| **Date** | 2026-06-07 |
| **Ticket** | [VOL-233](https://linear.app/voltr/issue/VOL-233/run-final-release-validation-for-sdk-scripts) |
| **Repository** | `voltrxyz/sdk-scripts` |
| **Branch** | `shayn-shin/vol-233-run-final-release-validation-for-sdk-scripts` |
| **Commit** | `48e3054` (VOL-236: reframe sdk-scripts as a standalone product) |
| **Toolchain** | node v25.8.2, pnpm 9.15.0 (matches pinned `packageManager`) |
| **Platform** | darwin (macOS) |
| **Network** | public Solana mainnet RPC reachable (read-only); no project RPC/keypairs/`.env` configured |

## Decision: **NOT RELEASE-READY**

One release blocker (**B1**) prevents the documentation from being followed from
a clean checkout: the documented primary entry point `pnpm cli -- … --profile
configs/…` fails because the wrapper runs in `apps/cli/`, so the repo-root-relative
profile paths used by **~97 documented examples** (including the README
quick-start) do not resolve. The CLI logic itself is sound — every quality gate
passes and the command surface is correct — but the **documented operator
experience is broken**, which fails the acceptance criterion "Documentation can
be followed from a clean checkout."

Fixing B1 is a one-line change (run the CLI from the repo root). After B1 is
resolved (and ideally the minor items M1/M2 below), re-run this checklist; the
product is otherwise in good shape.

---

## Requirements results

| # | Requirement | Result |
| --- | --- | --- |
| 1 | Clean-install, formatting, linting, typecheck, build, test | **Partial** — install/typecheck/build/test pass; **no formatting/linting tooling exists** (M2) |
| 2 | Every transaction command in `--mode print` (neutral profiles) | **Pass** — all 41 exercised; see [Print mode](#print-mode) |
| 3 | `--mode simulate` where practical and safe | **Plumbing pass / OK-result skipped** — see [Simulate](#simulate-mode) |
| 4 | Every command/subcommand exposes readable, accurate `--help` | **Pass** — 45/45 |
| 5 | Operator workflows need only flags/profiles/env (never source edits) | **Pass** |
| 6 | Command-coverage inventory has no unexplained gaps | **Pass** |
| 7 | Consistent naming/options/output/exit codes/errors/modes/profiles | **Pass** |
| 8 | Docs sufficient for a developer with no prior context | **Fail** — blocked by B1; minor M1 |
| 9 | `sdk-scripts` presented as a standalone product everywhere | **Pass** |
| 10 | Record all skipped checks with a reason | **Done** — see [Skipped checks](#skipped-checks) |
| 11 | File/link issues for every unresolved blocker | **Drafted** — see [Issues to file](#issues-to-file) |

## Acceptance-criteria mapping

| Acceptance criterion | Status |
| --- | --- |
| A dated release-validation checklist is committed to the repository | **This document** |
| Clean installation and all repository quality commands pass | **Pass** (install, typecheck, build, test, terminology); formatting/linting N/A (M2) |
| Every transaction command passes print-mode validation | **Pass** (see Print mode — 27 build+print end-to-end; 14 reach builder, fail only on synthetic chain data; logic covered by offline smoke tests) |
| Simulation results recorded; every skipped simulation has its reason | **Done** (plumbing validated; OK-result simulate skipped — needs a real deployment) |
| CLI help and representative success/failure paths validated across integrations | **Pass** |
| The command-coverage inventory contains no unexplained gaps | **Pass** |
| Documentation can be followed from a clean checkout | **Fail** — **B1** |
| Product terminology checks pass | **Pass** |
| Every unresolved problem has a linked Linear issue with owner or triage status | **Drafted here with triage status; filing pending confirmation** |
| The checklist concludes with a clear release-ready / not-ready decision | **Not release-ready** (B1) |

---

## 1. Clean install + quality gates

All commands run from a clean checkout (no `node_modules`), repo root.

| Command | Result | Notes |
| --- | --- | --- |
| `pnpm install --frozen-lockfile` | ✅ exit 0 | Lockfile up to date; 254 packages; ~2s |
| `pnpm typecheck` | ✅ exit 0 | `tsc -p tsconfig.check.json` (whole workspace incl. tests, from source) |
| `pnpm build` | ✅ exit 0 | 5 packages compiled to `dist/` (core → kamino/spot/trustful → cli) |
| `pnpm test` | ✅ exit 0 | **130 pass / 0 fail**; includes the terminology guard case and offline builder smoke tests for every adapter |
| `pnpm check:terminology` | ✅ exit 0 | "OK — no historical porting language found." |
| `pnpm check` (canonical CI gate) | ✅ exit 0 | typecheck → build → test, 130/130 |
| formatting | ⚠️ **N/A** | No formatter configured (no prettier/editorconfig, no `format` script) — **M2** |
| linting | ⚠️ **N/A** | No linter configured (no eslint, no `lint` script) — **M2** |

The repository's quality contract (documented in `docs/testing.md`) is strict
`tsc` + `node:test` + the terminology guard. There is no eslint/prettier layer;
the two required "formatting" and "linting" commands have nothing to run (M2).

## 2. `--help` validation

- Root `--help`: lists all 45 commands grouped by prefix, all global options
  (`--profile`, `--rpc-url`, `--mode`, `--multisig-address`, priority-fee flags,
  `--compute-unit-limit`), worked examples, and the `pnpm cli --` note.
- **All 45 commands**: exit 0, with `Usage:`, an `Options:`/`Arguments:` section,
  and a description. **0 anomalies.**
- Accuracy spot-checks pass: `vault:update-config --help` enumerates all 13 config
  fields dynamically; `kamino:*:claim-reward-with-index` shows the `--reward-index`
  flag and correct defaults (reward-token-program = SPL Token, slippage 50,
  jupiter-max-accounts 18); `vault:init-direct-withdraw` documents the
  "required when overriding `--adaptor-program`" conditional.
- Both invocation forms work: `<cmd> --help` and `help <cmd>`; `pnpm cli -- --help`
  works (when run such that pnpm resolves the script — see B1 for the path caveat).

## 3. Print mode

Validation environment: a **neutral profile** with well-formed but arbitrary
(throwaway-keypair) placeholder addresses, the real USDC mint / SPL Token program,
a throwaway signer keypair, and the public mainnet RPC. (Architecture note: a
command **builds the operation first — including RPC reads / on-chain decodes —
and then dispatches `--mode`**, so `print` is not offline; this is documented in
`docs/operator-guide.md §2`.)

**All 41 transaction commands were exercised in `--mode print`. No command
exhibited a wiring/code defect.** Breakdown:

**27 built and printed a real `BuiltOperation` summary end-to-end** (flags →
profile → signer → builder → `processOperation` → JSON):

- `vault:*` — all 14 transaction commands (init, init-and-set-token-metadata,
  set-token-metadata, update-config, accept-admin, harvest-fee, deposit,
  request-withdraw, cancel-request-withdraw, withdraw, instant-withdraw,
  add-adaptor, remove-adaptor, init-direct-withdraw). `withdraw` and
  `cancel-request-withdraw` print even against an **unreachable** RPC, proving the
  pure-build path is correctly wired and runs before mode dispatch.
- `kamino:kvault:init`
- `spot:swap:init`, `spot:earn:init`, `spot:earn:deposit`, `spot:earn:withdraw`,
  `spot:earn:init-direct-withdraw`
- `trustful:*` — all 7 (arbitrary init/deposit/withdraw, curve init/borrow/repay/remove)

**14 reached their builder and failed only because the neutral placeholder
addresses are not real on-chain state** — the documented build-phase RPC/Jupiter
dependency, not a defect. Each failed with a clear, actionable message:

- `kamino:market:{init,deposit,withdraw,claim-reward,claim-reward-with-index}` (5) — "Kamino reserve account … was not found"
- `kamino:kvault:{deposit,withdraw,claim-reward,claim-reward-with-index,direct-withdraw,request-and-direct-withdraw}` (6) — "Kamino kvault account … was not found"
- `spot:swap:{buy,sell}` (2) — Jupiter: "the token … is not tradable" (reached the Jupiter API; the placeholder foreign mint is not a tradable token)
- `spot:earn:extend-lut` (1) — "Account not found" (the placeholder lookup table does not exist on-chain)

The build logic of these 14 is independently covered by the **passing offline
builder smoke tests** (`packages/{kamino,spot,trustful}/src/operations/*.test.ts`),
which assert either a valid `BuiltOperation` or a clean failure when on-chain state
is absent (e.g. "kamino:market:deposit rejects with a clear error when the reserve
is missing").

**Query commands (3):** `vault:query:position`, `vault:query:strategy-positions`,
`spot:query:strategy-positions` each reached the RPC and returned a clean "Account
not found" because the neutral vault is not a real on-chain account — the read path
is validated; a successful read requires a real deployment.

## 4. Simulate mode

`--mode simulate` plumbing was validated end-to-end on representative commands
(`vault:deposit`, `trustful:curve:init`): the CLI builds the operation, sends a
read-only `simulateTransaction` to the live RPC, and prints structured output —
`simulation: FAILED`, `computeUnits`, `error: "AccountNotFound"`, and an explorer
inspector URL. The `FAILED`/`AccountNotFound` result is expected because the
neutral vault does not exist on-chain.

A **meaningful (OK) simulation is recorded as skipped** — see Skipped checks.

## 5. Operator workflow (no source edits)

**Pass.** All operational values are sourced from the JSON profile
(vault/asset/strategy addresses, oracles, seed, discriminators), per-call values
from CLI flags (amounts, slippage, signer paths, mode), and RPC/keypair paths from
flags or env vars (`RPC_URL`/`HELIUS_RPC_URL`, `ADMIN_KEYPAIR`/`MANAGER_KEYPAIR`/
`USER_KEYPAIR`). The architecture contract states "TypeScript source files MUST NOT
be edited to change runtime values," and the entire validation above was driven
purely through `--profile`, flags, and env vars — no source file was edited to run
any command.

## 6. Command-coverage inventory

**Pass — no unexplained gaps.**

- The CLI exposes **45 commands**; **all 45 are documented** in the README and/or
  `docs/`. (0 undocumented.)
- Per-integration doc command tables (`docs/kamino.md`, `spot.md`, `trustful.md`,
  `adaptor-admin.md`) match the implemented builders exactly.
- Adaptor program IDs are consistent between code constants and docs: Spot
  `EW35URAx3LiM13fFK3QxAXfGemHso9HWPixrv7YDY4AM`, Trustful
  `3pnpK9nrs1R65eMV1wqCXkDkhSgN18xb1G5pgYPwoZjJ`; Kamino default
  `to6Eti9CsC5FGkAtqiPphvKD2hiQiLsS8zWiDBqBPKR`.
- Capabilities intentionally **not** exposed as standalone commands are explicitly
  documented as programmatic/deferred (per architecture rule 8): lookup-table
  extension after `vault:init` / `kamino:*:init` / `trustful:curve:init` uses the
  core LUT helpers (`buildExtendLookupTableInstructions`,
  `collectInstructionAddresses`, `getAddressesByLookupTable`); `transfer_curve` is
  hand-built; `klend-sdk` is used decode-only. (`spot:earn:extend-lut` is the one
  LUT-extension surfaced as a command.)

## 7. Consistency

**Pass.**

- **Naming:** `<group>:<domain>:<action>` throughout; singular imperative verbs;
  role carried by `--<role>-keypair` (not a domain segment); query commands marked
  by a literal `query` segment.
- **Options:** the `--<role>-keypair` flag has one canonical wording on every
  command (`addRoleKeypairOption`); shared coercion (`--amount`, `--slippage-bps`,
  `--reward-index`, `--jupiter-max-accounts`, addresses) via `lib/parse.ts`, each
  naming the offending flag on error.
- **Output:** transaction modes print a consistent JSON summary (`label`,
  `instructionCount`, `lookupTableAddresses`) plus optional operation metadata;
  queries print `JSON.stringify(…, 2)`.
- **Exit codes:** success = 0, every failure path = 1 (verified across 10 paths:
  success, missing keypair, missing profile field, invalid `--mode`, invalid
  `--amount`, multisig without `--multisig-address`, init-rejects-multisig,
  build-data failure, bad profile path, unknown command).
- **Error handling:** `CliError`/`ProfileValidationError`/`ProfileFieldError` print
  a clean actionable message (no stack); unexpected errors get an `Error:` prefix
  (stack only under `DEBUG`).
- **Transaction modes:** all transaction commands honor `--mode` via
  `processOperation`; the 3 query commands and `check` ignore it. `vault:init*`
  reject `--mode multisig` with a clear `CliError`. `multisig` payload emission
  (base64 + base58 + explorer) works.
- **Profile behavior:** zod-validated on load; per-command `require*` accessors
  throw a `ProfileFieldError` naming the missing field and the requesting command,
  before any network/keypair I/O.

## 8 & 9. Documentation & standalone-product terminology

- **Standalone product:** the terminology guard passes; no fork/ported/predecessor/
  "derived-from" language anywhere on the product surface; no references to any
  external Voltr repository; uniform naming (`@voltr/scripts-{core,kamino,spot,
  trustful,cli}`, root `voltr-integration-scripts`, CLI `voltr-scripts`, all
  v0.1.0). Docs/code/CLI/tests/metadata present sdk-scripts as standalone. **Pass.**
- **Clean-checkout followability:** **Fails on B1** — the documented `pnpm cli`
  invocation with relative profile paths does not work from the repo root. Minor
  M1: the README quick-start's first runnable command (`vault:deposit` against the
  example template) cannot succeed because the template's `vault.vaultAddress` is
  empty by design.

---

## Skipped checks (with reasons)

| Check | Reason skipped |
| --- | --- |
| `formatting` / `linting` commands | No formatter/linter is configured in the repo (no eslint/prettier/editorconfig, no `lint`/`format` scripts). The quality contract is strict `tsc` + `node:test` + terminology guard. Tracked as **M2**. |
| `--mode simulate` with an **OK** result | A successful (non-error) simulation requires a real, initialized Voltr vault deployment with real strategy addresses (Kamino reserve/kvault, Spot foreign mint + Pyth oracles, Trustful seed) and the matching authority keypair, plus Jupiter routing for swaps. None of these production resources are available in a neutral validation environment, and executing/simulating against a real deployment needs operator-provided addresses + keys (out of scope per the ticket without operator approval). Simulate **plumbing** was validated (structured FAILED result + explorer URL). |
| `--mode execute` | Out of scope: sends a real on-chain transaction with real funds; requires explicit operator approval (ticket "Out of Scope"). |
| Successful query results (`*:query:*`) | Same as simulate-OK: requires a real on-chain vault. The read path (RPC fetch + decode) was validated; it returns a clean "Account not found" against the neutral vault. |
| Live print/simulate for the 14 adapter commands that decode on-chain state / call Jupiter | Requires real strategy addresses (and Jupiter-tradable mints). Build logic is covered by the passing offline builder smoke tests; CLI wiring confirmed by the print sweep reaching each builder. |

---

## Findings

### B1 — BLOCKER: `pnpm cli` runs in `apps/cli/`, breaking documented relative `--profile` paths

The root `cli` script is `pnpm --filter @voltr/scripts-cli dev`. pnpm runs a
package script with its working directory set to that package (`apps/cli/`), so a
**repo-root-relative** `--profile configs/…` path resolves under
`apps/cli/configs/…` and fails:

```
$ pnpm cli -- --profile configs/examples/usdc.mainnet.example.json check
Error: Failed to read profile at …/apps/cli/configs/examples/usdc.mainnet.example.json:
ENOENT: no such file or directory
```

The same command works with an **absolute** path, or via the built binary run from
the repo root (`node apps/cli/dist/index.js --profile configs/… check`). But the
README and `docs/` use the relative `pnpm cli -- … --profile configs/…` form in
**~97 examples**, including the quick-start, so a developer/operator following the
documentation from a clean checkout fails on essentially every profile-reading
command.

- **Impact:** fails the acceptance criterion "Documentation can be followed from a
  clean checkout." High severity — it breaks the primary documented experience.
- **Not a logic bug:** the CLI itself is correct; only the documented entry
  point + relative paths are broken.
- **Recommended fix (one line):** make the root `cli` script invoke the CLI from
  the repo root so the working directory stays at root, e.g.
  `"cli": "TSX_TSCONFIG_PATH=tsconfig.check.json tsx apps/cli/src/index.ts"`.
  Verified: with cwd at the repo root, `--profile configs/examples/usdc.mainnet.example.json check`
  resolves and succeeds. (Alternatively, document absolute paths — less ergonomic.)

### M1 — Minor: README quick-start uses a profile that cannot run the shown command

The README "First commands" shows `vault:deposit` against
`configs/examples/usdc.mainnet.example.json`, whose `vault.vaultAddress` is empty
by design (it is a template; the address is generated by `vault:init`). Even with
the correct cwd and an RPC, the command fails with
`Profile … is missing required field "vault.vaultAddress"`. The quick-start should
lead with `check` (which works on the template) or note that `vault:deposit`
requires a real vault address (run `vault:init` first, or copy the template and
fill it in). Also, the quick-start does not mention that even `--mode print` needs
a reachable RPC (documented later in the operator guide §2).

### M2 — Minor: no formatting/linting tooling for two required commands

VOL-233 lists "formatting" and "linting" among the commands to run, but the repo
has no formatter or linter (no eslint/prettier/editorconfig, no `lint`/`format`
scripts). Either add an eslint/prettier layer with `lint`/`format` scripts, or
document explicitly that strict `tsc` + `node:test` + the terminology guard are the
intended quality gate and formatting/linting are intentionally out of scope.

### O1 — Observation: live simulate/query OK-results need a real deployment

Recorded under Skipped checks. Not a defect — it is the documented build-phase
RPC/Jupiter dependency plus the absence of a real vault deployment in a neutral
environment.

### O2 — Observation: all packages are `private: true`, version `0.1.0`

Consistent with a clone-and-run-from-source distribution model (`pnpm install` →
`pnpm cli`). If the product is ever intended for npm publication, `private: true`
would need revisiting. Confirm the intended distribution model and whether `0.1.0`
is the intended initial release version.

---

## Issues to file

| ID | Title | Severity | Triage status |
| --- | --- | --- | --- |
| B1 | `pnpm cli` runs in `apps/cli/`; documented relative `--profile configs/…` paths fail from a clean checkout | **Blocker** | Open — release-blocking; fix is a one-line root `cli` script change. Owner: TBD |
| M1 | README quick-start `vault:deposit` example uses the empty-vault template profile | Minor | Open — docs fix. Owner: TBD |
| M2 | No formatter/linter configured for the required formatting/linting commands | Minor | Open — add tooling or document the quality contract. Owner: TBD |

> Linear issues for B1 (and optionally M1/M2) should be created and linked here.
> They are drafted above with an explicit triage status pending creation.

---

## How this was validated (reproducibility)

- Toolchain: node v25.8.2, pnpm 9.15.0; clean checkout (removed `node_modules`/`dist`).
- Quality gates: `pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm build`,
  `pnpm test`, `pnpm check:terminology`, `pnpm check` — all exit 0.
- Help: `--help` for the root and all 45 commands via the built binary.
- Print/simulate: a neutral profile (throwaway-keypair placeholder addresses + real
  USDC mint) and throwaway signer, against the public mainnet RPC; pure-build
  commands also verified against an unreachable RPC.
- No repository source files were modified during validation; build artifacts
  (`dist/`) are gitignored.

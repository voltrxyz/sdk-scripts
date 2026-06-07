# Architecture and Operation-Builder Contract

This document is the canonical spec for adding operation builders and CLI commands in this repo. **Read it before adding a new integration or operation.**

It defines *how* an operation builder, query, profile section, or CLI command is shaped. For an end-to-end walkthrough, see [How to add a new operation builder + CLI command](#how-to-add-a-new-operation-builder--cli-command); for a brand-new integration package, see [Template: adding a new integration](#template-adding-a-new-integration-x).

## Goals

A single workspace that operates Voltr vaults and their protocol integrations:

- keeps shared vault, signer, RPC, LUT, and transaction behavior in one place (`packages/core`);
- isolates protocol-specific account derivation and instruction building in adapter packages (`packages/kamino`, `packages/spot`, `packages/trustful`);
- exposes everything through one CLI (`apps/cli`) so operational values come from JSON profiles and CLI flags rather than edited TypeScript files.

## Layout

```text
apps/cli/              # User-facing command runner (argv, keypairs, mode dispatch)
packages/core/         # Shared env, profile, signer, tx, LUT, token, vault helpers
packages/kamino/       # Kamino-specific operation builders + queries
packages/spot/         # Spot/Jupiter-specific operation builders + queries
packages/trustful/     # Trustful-specific operation builders + queries
examples/              # Runnable programmatic examples (public-API consumers)
configs/examples/      # JSON profile examples
docs/                  # Architecture contract + per-integration references
```

## Package responsibilities

### `packages/core` (`@voltr/scripts-core`)

Owns everything that is not protocol-specific:

- profile loading and validation (`loadProfile`);
- RPC creation and `ScriptContext` (`createScriptContext`);
- signer loading from JSON keypair files (`loadSignerFromFile`);
- argument coercion helpers (`asAddress`, `optionalAddress`, `parseBigintAmount`);
- transaction processor that consumes a `BuiltOperation` (`processOperation`);
- optimized send with compute-unit estimation and priority fee (`sendAndConfirmOptimizedTx`);
- lookup-table fetch + extend helpers (`getAddressesByLookupTable`, `buildExtendLookupTableInstructions`);
- token-account setup (`setupTokenAccount`);
- kit-native account-meta helpers (`readonlyAccount`, `writableAccount`, `withRemainingAccounts`) and little-endian integer codecs (`encodeU64Le`, `encodeU16Le`) shared by every adapter;
- web3.js ↔ kit interop (`publicKeyToAddress`, `kitAccountMetaFromWeb3`, `appendRemainingAccounts`);
- builders for the shared vault primitive under `src/vault/` (`vault:*` commands such as `buildDepositVaultOperation`).

Constraints:

- MUST NOT depend on `@solana/web3.js`.
- MUST NOT import from any adapter package.
- MUST NOT parse CLI argv (the CLI does that, then calls into core).
- New execution modes (`simulate`, `multisig`) are added once, inside `packages/core/src/tx/processor.ts`. They are not reimplemented per adapter.

### `packages/kamino`, `packages/spot`, `packages/trustful`

Each adapter package owns ONLY adapter-specific logic:

- PDA derivation for the adapter (reserves, kvaults, market authorities, oracle accounts, strategy seeds, etc.);
- remaining-account ordering required by the adapter's CPI;
- operation builders that compose adapter instructions on top of vault SDK calls and return a `BuiltOperation`;
- read-only queries (positions, oracle prices, on-chain config inspection) under `src/queries/`.

Constraints:

- Each adapter package depends on `@voltr/scripts-core` for shared types and helpers.
- An adapter package MAY depend on its upstream SDK (e.g. `@kamino-finance/klend-sdk`) even if that SDK pulls in `@solana/web3.js`. Conversion to kit happens inside the builder using helpers from `core/interop/web3-kit.ts`.
- Adapter packages MUST NOT import each other. New cross-adapter behavior belongs in `core`.
- Adapter packages MUST NOT read keypair files, parse CLI args, or send transactions.

### `apps/cli` (`@voltr/scripts-cli`)

The only place that:

- parses argv (commander);
- loads keypairs from disk (`loadSignerFromFile`);
- loads profiles from disk (`loadProfile`);
- prints output and sets exit codes;
- hands a `BuiltOperation` to `processOperation`.

The CLI must stay thin. Each command is "parse flags → coerce values → call builder → hand to processor". Concretely:

- `apps/cli/src/index.ts` only builds the root program, attaches global options, and calls each group's `register<Group>Commands(program)`. Keep it free of command bodies.
- Commands live one file per group under `apps/cli/src/commands/<group>.ts`, each exporting a `register<Group>Commands(program)` function. Adding a group is an import + one register call in `index.ts`.
- Shared CLI helpers live under `apps/cli/src/lib/`:
  - `globals.ts` — global option definitions, `loadCommandContext(program)` (read globals → `loadProfile` → `createScriptContext`), and `resolveProcessorOptions(globals)`.
  - `signers.ts` — `loadRoleSigner(role, flagValue)` resolves an `admin` / `manager` / `user` keypair from the `--<role>-keypair` flag or the `<ROLE>_KEYPAIR` env var, and `addRoleKeypairOption(command, role)` declares that flag with one canonical wording on every command.
  - `parse.ts` — flag coercion every command shares: `parseAmount`, `parseBps`, `parseU16`, `parseCount`, `parseIndex`, and `parseAddress`. Each takes the raw value plus the flag name and throws a `CliError` that names the flag. Do not re-implement amount / basis-point / index / count / address parsing inside a command module.
  - `output.ts` — formatting helpers for non-transaction output (summaries, queries).
  - `errors.ts` — `CliError` (user-facing, no stack trace) and the top-level `reportError` handler.

### `examples` (`@voltr/scripts-examples`)

Runnable TypeScript examples that demonstrate the **public** programmatic API for
SDK consumers (see [examples/README.md](../examples/README.md)). They are a
parallel consumer of the packages, not part of the CLI.

- Examples import only documented package entry points — `@voltr/scripts-core`,
  `@voltr/scripts-kamino`, `@voltr/scripts-spot`, `@voltr/scripts-trustful`. They
  MUST NOT import private source paths (`packages/*/src/*`, `apps/cli/src/*`). If
  an example cannot be written without a private import, add a deliberate public
  export to the package (with a focused test) instead.
- Like the CLI, an example is "load profile → call builder → hand the
  `BuiltOperation` to `processOperation`". It must not re-implement builder logic
  or duplicate CLI command modules.
- Examples are not a second operator command surface. Each is one self-contained
  file for one action, run directly with `pnpm exec tsx examples/src/<group>/<file>.ts`
  or by name with `pnpm example -- <name>` (`pnpm examples:list` catalogs them).
  Both run with no arguments — config falls back to env vars (`VOLTR_PROFILE`,
  `VOLTR_MODE`, `RPC_URL`, `<ROLE>_KEYPAIR`), each with an equivalent flag
  (`--profile`, `--mode`, …) that overrides it; per-run values (amounts, rates)
  are constants at the top of the file.
- The shared harness lives under `examples/src/shared/` (parses flags, loads the
  profile, builds the RPC context, loads signers, processes the operation);
  `examples/src/registry.ts` holds the catalog metadata. `pnpm examples:check`
  typechecks the workspace against the real package exports (the drift guard) and
  runs offline runtime checks (registry/help/safety/offline-build); it is part of
  `pnpm check` (see [docs/testing.md](./testing.md)).

## Adapter package standard

All three adapter packages (`kamino`, `spot`, `trustful`) follow one layout and
naming convention so adding a new integration is a predictable copy.

### Directory layout

```text
packages/<adapter>/src/
  constants.ts           # program ids, discriminators, seeds
  pda.ts                 # PDA derivations (always `pda.ts`, never `pdas.ts`)
  <domain>.ts            # optional domain helper modules (reserve.ts, kvault.ts,
                         # jupiter.ts, swap.ts): account loaders, decoders
  operations/
    <domain>.ts          # one module per strategy domain; all of that domain's
                         # build…Operation builders live together
    <domain>.test.ts     # offline builder tests for that domain
  queries/
    <noun>.ts            # read-only query<…> functions (no transactions)
  index.ts               # barrel: constants -> helpers -> operations -> queries
```

- Filenames are kebab-case. Group operation builders by strategy **domain**
  (`market`/`kvault`, `swap`/`earn`, `arbitrary`/`curve`) rather than one file per
  action — this keeps each domain's shared internals (a private swap composer, a
  hand-built instruction) in one cohesive module. All of a domain's builders live
  in one module, regardless of signer role (the Kamino kvault module holds both
  the manager strategy ops and the user direct-withdraws).
- An adapter-local `account-meta.ts` is only justified when remaining-account
  ordering is genuinely protocol-specific and not expressible with the shared
  core helpers. Generic helpers live in `core`, not the adapter.

### Builders, args, and labels

| Thing            | Convention                                    | Example |
| ---------------- | --------------------------------------------- | ------- |
| builder function | `build<Integration><Domain><Action>Operation` | `buildKaminoMarketDepositOperation` |
| args interface   | `<Integration><Domain><Action>Args`           | `KaminoMarketDepositArgs` |
| command / label  | `<integration>:<domain>:<action>`             | `kamino:market:deposit` |

The builder `label` MUST equal the CLI command name, and the function / label /
args names are mechanically derivable from each other (split the label on `:`,
PascalCase each segment). For example the Spot swap-buy builder is
`buildSpotSwapBuyOperation` with label `spot:swap:buy`. Never repeat the
integration as the domain (no `spot:spot:*`).

### Constants

- `<INTEGRATION>_ADAPTOR_PROGRAM_ID` — the Voltr adaptor program the vault CPIs into.
- `<INTEGRATION>_DISCRIMINATOR` — a `Record<string, readonly number[]>`. Store
  plain number arrays and wrap with `new Uint8Array(...)` at the call site so each
  instruction gets its own copy.
- `<INTEGRATION>_SEEDS` — PDA seed-string constants, when the adapter has them.

### Shared helpers (from `@voltr/scripts-core`)

Do not reimplement these per adapter:

- `readonlyAccount(addr)`, `writableAccount(addr)` — kit `AccountMeta` builders.
- `withRemainingAccounts(ix, metas)` — append kit-native remaining accounts.
- `encodeU64Le(bigint)`, `encodeU16Le(number)` — little-endian integer bytes.
- `setupTokenAccount`, LUT, signer, and tx helpers (see "Package responsibilities").
- web3.js → kit conversion at the web3.js compatibility boundary via `interop/web3-kit.ts`
  (`publicKeyToAddress`, `kitAccountMetaFromWeb3`, `appendRemainingAccounts`).

### Exports and tests

- `index.ts` is organized constants → PDA / domain helpers → operations →
  queries. Do not export internal-only helpers (a hand-built instruction, a
  private encoder).
- Co-locate offline builder tests as `operations/<domain>.test.ts` using
  `createFakeScriptContext` + `assertBuiltOperationShape`. Builders that must
  decode on-chain state to derive accounts (e.g. Kamino reserves) instead assert
  a clear failure when that state is absent. Pure PDA / encoding helpers are
  tested in `core`.
- Every package manifest exposes the same `build`, `typecheck`, and `test`
  scripts. The repo-root `pnpm typecheck` / `pnpm test` / `pnpm check` remain the
  canonical offline gate (a single-package `typecheck` resolves `core` from its
  built `dist/`, so build `core` first or just use the root script).

### Template: adding a new integration `<x>`

1. `packages/<x>/` with `package.json` (name `@voltr/scripts-<x>`, the standard
   `build` / `typecheck` / `test` scripts, its SDK deps) and a build `tsconfig.json`.
2. `constants.ts` with `<X>_ADAPTOR_PROGRAM_ID`, `<X>_DISCRIMINATOR`, `<X>_SEEDS`.
3. `pda.ts` for derivations; optional `<domain>.ts` helper modules for account
   loaders / decoders.
4. `operations/<domain>.ts` exporting `build<X><Domain><Action>Operation`
   builders, plus `operations/<domain>.test.ts`.
5. `queries/<noun>.ts` for read-only `query<X><Noun>` functions, if any.
6. `index.ts` barrel, organized as above.
7. Add the package path to `tsconfig.check.json` `paths`, and to the CLI's
   `package.json` dependencies once the CLI consumes it.

## Operation-builder contract

### Signature

```ts
import type { ScriptContext, BuiltOperation } from "@voltr/scripts-core";

export interface DepositXArgs {
  // explicit, named, kit-typed fields only
}

export async function buildDepositXOperation(
  ctx: ScriptContext,
  args: DepositXArgs
): Promise<BuiltOperation>;
```

The canonical reference implementation is `buildDepositVaultOperation` in `packages/core/src/vault/operations.ts`. New builders should mirror its shape.

### `BuiltOperation`

```ts
interface BuiltOperation {
  label: string;                      // command name, e.g. "vault:deposit"
  instructions: Instruction[];        // ordered kit instructions
  lookupTableAddresses?: Address[];   // LUTs the processor should fetch
  computeUnitLimit?: number | null;   // explicit override; omit/null = on-chain estimate
}
```

### Rules

1. **No filesystem I/O.** Builders never call `readFile`, `loadProfile`, or `loadSignerFromFile`. Signers and JSON profile data come in as args, already loaded by the CLI.
2. **No CLI parsing.** Builders accept already-coerced types (`Address`, `bigint`, `KeyPairSigner`, `boolean`, etc.). The CLI coerces flag values with the shared parsers in `apps/cli/src/lib/parse.ts` (`parseAddress`, `parseAmount`, `parseBps`, `parseCount`, `parseIndex`, `parseU16` — which wrap core's `asAddress` / `parseBigintAmount` primitives and re-throw a flag-aware `CliError`) and loads signers with `loadRoleSigner`, before calling.
3. **No transaction sending.** Builders return instructions; they never call `sendAndConfirmOptimizedTx`. The processor decides whether to send, simulate, print, or hand off to a multisig.
4. **Return everything the processor needs.** ATA-creation instructions, sync-native, vault SDK instructions, adapter-specific instructions — all of them, in order, in `instructions`. Any LUTs the tx will need go in `lookupTableAddresses`; the processor fetches their contents.
5. **RPC reads are allowed,** but only to construct instructions (e.g. checking ATA existence, fetching adapter state to derive remaining accounts). Use `ctx.rpc`.
6. **Do not read `ctx.profile`.** Profile values the builder needs must come in via `args`. The CLI is responsible for picking values out of the profile and passing them explicitly. This keeps builders unit-testable without a profile and lets a future caller (a server, a test harness) supply args by other means.
7. **Set `computeUnitLimit` only when on-chain estimation is unreliable.** Default to `undefined`/`null` to let the processor estimate.
8. **One builder, one operation.** If a flow needs to be split across multiple transactions, return one `BuiltOperation` per transaction; do not pack multi-tx flows behind a single builder. Multi-tx orchestration is a future concern handled at the CLI/processor layer.

## Command naming

| Shape                                  | Use for                               | Example                       |
| -------------------------------------- | ------------------------------------- | ----------------------------- |
| `vault:<action>`                       | shared vault operations               | `vault:init`, `vault:deposit` |
| `<adapter>:<strategy>:<action>`        | adapter operations on a strategy      | `kamino:market:deposit`       |
| `<adapter>:<strategy>:query:<noun>`    | read-only adapter queries             | `kamino:market:query:reserve` |
| `vault:query:<noun>`                   | read-only vault queries               | `vault:query:position`        |

Rules:

- `<adapter>` is the package name: `kamino`, `spot`, `trustful`.
- `<strategy>` is the adapter-internal flavor: `market` / `kvault` (Kamino); `swap` / `earn` (Spot); `arbitrary` / `curve` (Trustful). Never repeat the adapter as the domain (no `spot:spot:*`).
- `<action>` is a singular, imperative verb: `init`, `deposit`, `withdraw`, `buy`, `sell`, `borrow`, `repay`, `remove`, `claim-reward`, `direct-withdraw`, `request-withdraw`, `cancel-request-withdraw`, `harvest-fee`, etc. Use the singular form even when the protocol instruction is plural (`claim-reward`, not `claim-rewards`).
- The signer role is carried by the `--<role>-keypair` flag, not the domain segment, so a user-signed flow lives under the strategy domain it acts on (the Kamino kvault direct-withdraws are `kamino:kvault:direct-withdraw` and `kamino:kvault:request-and-direct-withdraw`, not a separate `kamino:user:*` domain).
- For queries, the literal segment `query` marks the command as side-effect free. The noun that follows describes what is read (`position`, `reserve`, `strategy-positions`, `oracle`).
- The builder's `label` field MUST equal the command name. The CLI command name and the builder label are the same string.

## Query vs transaction commands

**Transactional commands**

- Call a `build<X>Operation` builder.
- Hand the resulting `BuiltOperation` to `processOperation`.
- Respect the global `--mode` flag (`print` | `execute` | `simulate` | `multisig`).

**Query commands**

- Call a `query<X>` function from the relevant package, which returns a plain JSON-serializable value.
- Print the result with `JSON.stringify(result, null, 2)` to stdout. Exit non-zero on RPC error.
- Do NOT respect `--mode`. They never build transactions.
- Live under `packages/<scope>/src/queries/<name>.ts` and are re-exported from the package's `src/index.ts`.

Example skeleton:

```ts
// packages/kamino/src/queries/reserve.ts
import type { ScriptContext } from "@voltr/scripts-core";
import type { Address } from "@solana/kit";

export interface QueryKaminoReserveArgs {
  reserve: Address;
}

export async function queryKaminoReserve(
  ctx: ScriptContext,
  args: QueryKaminoReserveArgs
): Promise<KaminoReserveSnapshot> { /* ... */ }
```

## web3.js compatibility boundary

Default to `@solana/kit` and `@solana-program/*` throughout. Some upstream SDKs (e.g. `@kamino-finance/klend-sdk`, Anchor-generated IDL clients) still produce `@solana/web3.js` `TransactionInstruction` and `PublicKey` values. Handle them like this:

- Convert at the package boundary using `packages/core/src/interop/web3-kit.ts`:
  - `publicKeyToAddress(pk)` → kit `Address`.
  - `kitAccountMetaFromWeb3(meta)` → kit `AccountMeta`.
  - `appendRemainingAccounts(kitIx, web3RemainingMetas)` to splice web3 remaining-accounts into a kit instruction.
- For a full web3 `TransactionInstruction`, build the kit `Instruction` directly:

  ```ts
  const kitIx: Instruction = {
    programAddress: publicKeyToAddress(web3Ix.programId),
    accounts: web3Ix.keys.map(kitAccountMetaFromWeb3),
    data: web3Ix.data,
  };
  ```

- `packages/core` MUST NOT depend on `@solana/web3.js`. Only adapter packages that need such an SDK declare that dependency (in their own `package.json`).
- A web3 type MUST NOT escape a builder. The `BuiltOperation` returned to the CLI is 100% kit.
- If a new interop helper is needed by more than one adapter, add it to `packages/core/src/interop/web3-kit.ts` rather than duplicating it.

## Where operational values live

- **JSON profiles (`configs/*.json`)** hold per-deployment values: vault address, asset mint, asset token program, LUT address, strategy reserve addresses, oracle addresses, strategy seed strings. Add new integration fields under `integrations.<adapter>` in the profile and extend `ScriptProfile` in `packages/core/src/types.ts`.
- **CLI flags** hold per-call values: signer paths (`--user-keypair`, `--manager-keypair`, `--admin-keypair`), amounts, slippage, mode.
- **`.env` / `--rpc-url`** holds the RPC endpoint (`RPC_URL` or `HELIUS_RPC_URL`) and may hold default keypair paths used by developer workflows.
- **TypeScript source files MUST NOT be edited to change runtime values.** If a value changes per-environment or per-deployment, it belongs in a profile or a flag. Operators change behavior through profiles and flags, never by editing source.

## How to add a new operation builder + CLI command

1. **Decide the package.**
   - Vault-level (no adapter SDK) → `packages/core/src/vault/<name>.ts`.
   - Adapter-specific → `packages/<adapter>/src/operations/<domain>.ts` (grouped by strategy domain).
   - Read-only → `packages/<scope>/src/queries/<name>.ts`.
2. **Write the builder.** Follow the contract above:
   - Export `<X>Args` typed in kit terms.
   - Export `async function build<X>Operation(ctx, args): Promise<BuiltOperation>`.
   - Compose instructions; isolate any web3.js inside.
   - Set `label` to the eventual CLI command name (e.g. `"kamino:market:deposit"`).
3. **Re-export from the package's `src/index.ts`.**
4. **Add the CLI command** to the group's module, `apps/cli/src/commands/<group>.ts`, inside its `register<Group>Commands(program)` function (a new group means a new module + one `register` call in `index.ts`):
   - Use commander to declare flags. One flag per builder arg that has no profile source. Make `--amount` and other per-call values `requiredOption`; declare the signer keypair with `addRoleKeypairOption(command, role)` (a plain `option` whose presence is enforced later by `loadRoleSigner`, so the env-var fallback works and the wording stays identical across commands).
   - Load the profile and context with `loadCommandContext(program)`; pull profile values with the `require*` accessors; coerce flags with the shared parsers from `lib/parse.ts` (`parseAddress`, `parseAmount`, `parseBps`, `parseCount`, `parseIndex`, `parseU16`) — each names the flag in its `CliError`; load signers with `loadRoleSigner(role, flag)`.
   - Resolve `resolveProcessorOptions(globals)` before loading keypairs so an invalid `--mode`/priority-fee invocation fails fast.
   - Call the builder with `(ctx, args)`.
   - Hand the result to `processOperation({ ctx, payer, operation, mode, options })`.
5. **Update profile schema if needed.** Add the new field under `integrations.<adapter>` in `configs/examples/*.json` and extend `ScriptProfile` in `packages/core/src/types.ts`.
6. **For queries**, skip the processor entirely — print `JSON.stringify(await query<X>(ctx, args), null, 2)` from the CLI command.
7. **Add a builder test.** Each adapter builder should have an offline smoke test next to it that asserts the output shape using `createFakeScriptContext` + `assertBuiltOperationShape` from `@voltr/scripts-core/testing`. Builders that must decode on-chain state to derive accounts instead assert a clear failure when that state is absent. Tests run offline (no RPC, no keypairs) and are auto-discovered by `pnpm test`. See [testing.md](./testing.md).

### Worked example (transaction)

```ts
// apps/cli/src/commands/kamino.ts
export function registerKaminoCommands(program: Command): void {
  const command = "kamino:market:deposit";
  addRoleKeypairOption(
    program
      .command(command)
      .summary("deposit vault assets into a Kamino lending market")
      .description(
        "Deposit vault assets into a Kamino lending market (klend reserve). --amount is the raw asset amount in smallest units. Signs as the vault manager."
      ),
    "manager"
  )
    .requiredOption("--amount <raw>", "raw asset amount in smallest units")
    .action(async (options: { managerKeypair?: string; amount: string }) => {
      const { globals, profile, ctx } = await loadCommandContext(program);
      const vault = requireVaultAddress(profile, { command });
      const assetMint = requireAssetMint(profile);
      const assetTokenProgram = requireAssetTokenProgram(profile);
      const reserve = requireKaminoReserve(profile, { command });
      const lookupTableAddresses = resolveLookupTableAddresses(profile, { command });
      const amount = parseAmount(options.amount, "--amount");
      const processorOptions = resolveProcessorOptions(globals);
      const manager = await loadRoleSigner("manager", options.managerKeypair);

      const operation = await buildKaminoMarketDepositOperation(ctx, {
        manager,
        vault,
        assetMint,
        assetTokenProgram,
        reserve,
        amount,
        lookupTableAddresses,
      });

      await processOperation({
        ctx,
        payer: manager,
        operation,
        mode: globals.mode,
        options: processorOptions,
      });
    });
}
```

## Independence between adapters

Kamino, Spot, and Trustful are independent:

- Each adapter lives in its own `packages/<name>` directory and ships its own `package.json` with its own SDK dependencies.
- None of the adapter packages import each other.
- Shared changes go to `packages/core`. If two adapters both need a new core helper, coordinate that change separately from the adapter work.
- When adapter work needs shared code, prefer the smallest possible addition to `core` (a new helper, a new field on `ScriptProfile`) and avoid refactoring core types that would force the other adapters to change.

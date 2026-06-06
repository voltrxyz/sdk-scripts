# Architecture and Operation-Builder Contract

This document is the canonical spec for adding operation builders and CLI commands in this repo. **Read it before adding a new migration.**

The migration order — which legacy scripts to port first, and in what sequence — lives in [migration-plan.md](./migration-plan.md). This document defines *how* a migration should be shaped, not *which* one comes next.

## Goals

The repo replaces the four legacy fork-per-integration repos with a single workspace that:

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
configs/examples/      # JSON profile examples
docs/                  # Architecture + migration plan
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
  - `signers.ts` — `loadRoleSigner(role, flagValue)` resolves an `admin` / `manager` / `user` keypair from the `--<role>-keypair` flag or the `<ROLE>_KEYPAIR` env var.
  - `output.ts` — formatting helpers for non-transaction output (summaries, queries).
  - `errors.ts` — `CliError` (user-facing, no stack trace) and the top-level `reportError` handler.

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
2. **No CLI parsing.** Builders accept already-coerced types (`Address`, `bigint`, `KeyPairSigner`, `boolean`, etc.). The CLI uses `asAddress`, `optionalAddress`, `parseBigintAmount`, `loadSignerFromFile` to coerce before calling.
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
- `<strategy>` is the adapter-internal flavor: `market` / `kvault` (Kamino); `spot` / `earn` (Spot); `arbitrary` / `curve` (Trustful).
- `<action>` is an imperative verb: `init`, `deposit`, `withdraw`, `borrow`, `repay`, `claim-reward`, `harvest-fee`, `request-withdraw`, `cancel-request-withdraw`, etc.
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

## web3.js isolation

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

- `packages/core` MUST NOT depend on `@solana/web3.js`. Only adapter packages that need a legacy SDK declare that dependency (in their own `package.json`).
- A web3 type MUST NOT escape a builder. The `BuiltOperation` returned to the CLI is 100% kit.
- If a new interop helper is needed by more than one adapter, add it to `packages/core/src/interop/web3-kit.ts` rather than duplicating it.

## Where operational values live

- **JSON profiles (`configs/*.json`)** hold per-deployment values: vault address, asset mint, asset token program, LUT address, strategy reserve addresses, oracle addresses, strategy seed strings. Add new integration fields under `integrations.<adapter>` in the profile and extend `ScriptProfile` in `packages/core/src/types.ts`.
- **CLI flags** hold per-call values: signer paths (`--user-keypair`, `--manager-keypair`, `--admin-keypair`), amounts, slippage, mode.
- **`.env` / `--rpc-url`** holds the RPC endpoint (`RPC_URL` or `HELIUS_RPC_URL`) and may hold default keypair paths used by developer workflows.
- **TypeScript source files MUST NOT be edited to change runtime values.** If a value changes per-environment or per-deployment, it belongs in a profile or a flag. This is the rule that justifies the entire migration — the old repos required swapping addresses at the top of a `.ts` file before each run.

## How to add a new operation builder + CLI command

1. **Find the source script** in the legacy repo. Reference paths (read-only):
   - `/Users/shayn/Desktop/voltr/voltr-base-scripts/src/scripts/`
   - `/Users/shayn/Desktop/voltr/voltr-kamino-scripts/src/scripts/`
   - `/Users/shayn/Desktop/voltr/voltr-spot-scripts/src/scripts/`
   - `/Users/shayn/Desktop/voltr/voltr-trustful-scripts/src/scripts/`

   These are migration references only. Do not edit them as part of migration work.
2. **Decide the package.**
   - Vault-level (no adapter SDK) → `packages/core/src/vault/<name>.ts`.
   - Adapter-specific → `packages/<adapter>/src/operations/<name>.ts`.
   - Read-only → `packages/<scope>/src/queries/<name>.ts`.
3. **Write the builder.** Follow the contract above:
   - Export `<X>Args` typed in kit terms.
   - Export `async function build<X>Operation(ctx, args): Promise<BuiltOperation>`.
   - Compose instructions; isolate any web3.js inside.
   - Set `label` to the eventual CLI command name (e.g. `"kamino:market:deposit"`).
4. **Re-export from the package's `src/index.ts`.**
5. **Add the CLI command** to the group's module, `apps/cli/src/commands/<group>.ts`, inside its `register<Group>Commands(program)` function (a new group means a new module + one `register` call in `index.ts`):
   - Use commander to declare flags. One flag per builder arg that has no profile source. Make `--amount` and other per-call values `requiredOption`; make role keypairs a plain `option` (presence is enforced by `loadRoleSigner`, so the env-var fallback works).
   - Load the profile and context with `loadCommandContext(program)`; pull profile values with the `require*` accessors; coerce flags with core helpers (`asAddress`, `parseBigintAmount`); load signers with `loadRoleSigner(role, flag)`.
   - Resolve `resolveProcessorOptions(globals)` before loading keypairs so an invalid `--mode`/priority-fee invocation fails fast.
   - Call the builder with `(ctx, args)`.
   - Hand the result to `processOperation({ ctx, payer, operation, mode, options })`.
6. **Update profile schema if needed.** Add the new field under `integrations.<adapter>` in `configs/examples/*.json` and extend `ScriptProfile` in `packages/core/src/types.ts`.
7. **For queries**, skip the processor entirely — print `JSON.stringify(await query<X>(ctx, args), null, 2)` from the CLI command.

### Worked example (transaction)

```ts
// apps/cli/src/commands/kamino.ts
export function registerKaminoCommands(program: Command): void {
  program
    .command("kamino:market:deposit")
    .description("Deposit vault assets into a Kamino lending market")
    .option("--manager-keypair <path>", "manager keypair JSON path (or MANAGER_KEYPAIR env)")
    .requiredOption("--amount <raw>", "raw asset amount in smallest units")
    .action(async (options: { managerKeypair?: string; amount: string }) => {
      const command = "kamino:market:deposit";

      const { globals, profile, ctx } = await loadCommandContext(program);
      const vault = requireVaultAddress(profile, { command });
      const assetMint = requireAssetMint(profile);
      const assetTokenProgram = requireAssetTokenProgram(profile);
      const reserve = requireKaminoReserve(profile, { command });
      const lookupTableAddresses = resolveLookupTableAddresses(profile, { command });
      const amount = parseBigintAmount(options.amount);
      const processorOptions = resolveProcessorOptions(globals);
      const manager = await loadRoleSigner("manager", options.managerKeypair);

      const operation = await buildKaminoDepositMarketOperation(ctx, {
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

## Reference: legacy repos (read-only)

| Repo                                                       | Purpose during migration                                |
| ---------------------------------------------------------- | ------------------------------------------------------- |
| `/Users/shayn/Desktop/voltr/voltr-base-scripts`            | Source for `vault:*` operations and shared utilities.   |
| `/Users/shayn/Desktop/voltr/voltr-kamino-scripts`          | Source for `kamino:*` operations.                       |
| `/Users/shayn/Desktop/voltr/voltr-spot-scripts`            | Source for `spot:*` operations.                         |
| `/Users/shayn/Desktop/voltr/voltr-trustful-scripts`        | Source for `trustful:*` operations.                     |

Do not edit those repos as part of migration work. Copy the logic out and adapt it to the contract in this document. Once an operation is migrated, the corresponding legacy script will be replaced with a thin wrapper or removed (see [migration-plan.md](./migration-plan.md)).

## Independence between adapters

Migrating Kamino, Spot, and Trustful are independent workstreams:

- Each adapter lives in its own `packages/<name>` directory and ships its own `package.json` with its own SDK dependencies.
- None of the adapter packages import each other.
- Shared changes go to `packages/core`. If two adapter migrations both require a new core helper, coordinate that change separately from the adapter work.
- If a migration cannot be completed without changing shared code, prefer the smallest possible addition to `core` (a new helper, a new field on `ScriptProfile`) and avoid refactoring core types that would force the other adapters to change.

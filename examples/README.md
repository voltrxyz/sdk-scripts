# Programmatic examples

Runnable, copyable TypeScript that shows how to consume the Voltr sdk-scripts
packages **directly** — importing the public operation builders and queries,
inspecting a `BuiltOperation`, and handing it to the shared transaction
processor from your own code.

Each example is **one self-contained file for one action**. Run a file directly
with no command-line arguments — configuration comes from environment variables,
and the handful of per-run values (amounts, rates) are clearly marked constants
at the top of the file.

## CLI or TypeScript?

- **Use the [CLI](../docs/operator-guide.md)** if you are a vault manager or
  operator performing routine workflows. It owns command UX, flags, profile
  config, transaction modes, and operator-facing errors. It is the primary,
  recommended interface.
- **Use these examples** if you are a developer embedding the builders in your
  own program. They show the lower-level programmatic API and are not a second
  operator command surface.

## Setup (once)

```bash
# 1. Install at the repo root (no install needed inside examples/):
pnpm install

# 2. Copy the example profile and fill in your vault's addresses:
cp configs/examples/usdc.mainnet.example.json configs/my-vault.json

# 3. Point the examples at your config + signers via env (e.g. in your shell or .env):
export VOLTR_PROFILE=configs/my-vault.json   # default if unset
export RPC_URL=https://your-rpc              # or HELIUS_RPC_URL, or profile.rpcUrl
export MANAGER_KEYPAIR=/path/to/manager.json # and/or ADMIN_KEYPAIR / USER_KEYPAIR
```

Read-only examples (`query-*`) need only `VOLTR_PROFILE` + an RPC; they load no
keypair.

## Running an example

There are two equivalent ways — the dispatcher is a convenience catalog over the
same files. Both work with **no arguments** (env defaults apply):

```bash
# Run the file directly:
pnpm exec tsx examples/src/kamino/market-withdraw.ts

# …or by name through the dispatcher:
pnpm example -- kamino:market-withdraw

# List every example with its group, role, and network requirement:
pnpm examples:list
```

Edit the constants at the top of the file for your run (amounts, rates, etc.):

```ts
// --- edit for your run ---
const AMOUNT = 1_000_000n; // raw asset amount, smallest units
// -------------------------
```

Every setting has both an **env var** and an **equivalent flag** (the flag wins);
either form works, and `--help` lists them:

```bash
pnpm exec tsx examples/src/vault/deposit.ts --help
pnpm exec tsx examples/src/vault/deposit.ts --profile configs/my-vault.json --mode simulate
VOLTR_MODE=simulate pnpm example -- vault:deposit          # env equivalent
VOLTR_MODE=execute  pnpm exec tsx examples/src/vault/deposit.ts   # send (gated, see below)
```

Flags: `--profile <path>`, `--rpc-url <url>`, `--mode <mode>`,
`--multisig-address <addr>`, `--yes`, `--help`. Env equivalents: `VOLTR_PROFILE`,
`RPC_URL`, `VOLTR_MODE`, `VOLTR_MULTISIG_ADDRESS`, `VOLTR_CONFIRM`.

## Safety

- **`print` is the default** — examples build and display the operation and never
  send.
- **`execute` is gated** — it requires confirmation: type `yes` at the prompt, or
  set `VOLTR_CONFIRM=1` for non-interactive runs. No example sends by default.
- **`multisig`** emits a Squads payload and needs `VOLTR_MULTISIG_ADDRESS`.
- **No secrets are committed.** Addresses come from your profile and keypairs from
  env vars; the only in-file values are example amounts/rates, never keys or real
  vault addresses.
- **Some builders read the chain even in `print`.** Building an operation may need
  RPC account reads, and the Kamino market/kvault deposit/withdraw/claim builders
  decode on-chain reserve/kvault state — so a working RPC is required to preview
  them. Each file's header says what it needs.

## Catalog

Run any file with `pnpm exec tsx <path>`, or by name with `pnpm example -- <name>`
(the name is the file path with `/` → `:` and no `.ts`). `pnpm examples:list`
prints this catalog live.

### Vault / core
| File | Role | Purpose |
| --- | --- | --- |
| `src/vault/initialize.ts` | admin | Initialize a vault; prints the generated address. |
| `src/vault/deposit.ts` | user | Deposit the profile asset. |
| `src/vault/request-withdraw.ts` | user | Request a withdrawal. |
| `src/vault/withdraw.ts` | user | Claim a requested withdrawal. |
| `src/vault/instant-withdraw.ts` | user | Redeem against idle assets in one tx. |
| `src/vault/cancel-request-withdraw.ts` | user | Cancel an outstanding request. |
| `src/vault/query-position.ts` | read-only | Read a user's position. |
| `src/vault/query-strategy-positions.ts` | read-only | Read per-strategy allocation. |

### Kamino
| File | Role | Purpose |
| --- | --- | --- |
| `src/kamino/market-init.ts` | manager | Initialize a lending-market strategy. |
| `src/kamino/market-deposit.ts` | manager | Deposit into a lending market. |
| `src/kamino/market-withdraw.ts` | manager | Withdraw from a lending market. |
| `src/kamino/market-claim-reward.ts` | manager | Claim a market farm reward (optional Jupiter swap). |
| `src/kamino/kvault-init.ts` | manager | Initialize a Kamino vault strategy. |
| `src/kamino/kvault-deposit.ts` | manager | Deposit into a Kamino vault. |
| `src/kamino/kvault-withdraw.ts` | manager | Withdraw from a Kamino vault. |
| `src/kamino/kvault-claim-reward.ts` | manager | Claim a kvault farm reward (optional Jupiter swap). |
| `src/kamino/kvault-direct-withdraw.ts` | user | User direct-withdraw from a kvault. |
| `src/kamino/kvault-request-and-direct-withdraw.ts` | user | Request + direct-withdraw in one tx. |

### Spot
| File | Role | Purpose |
| --- | --- | --- |
| `src/spot/swap-init.ts` | manager | Initialize a Spot swap strategy. |
| `src/spot/swap-buy.ts` | manager | Buy the foreign asset via Jupiter. |
| `src/spot/swap-sell.ts` | manager | Sell the foreign asset via Jupiter. |
| `src/spot/earn-init.ts` | manager | Initialize the Jupiter Earn strategy. |
| `src/spot/earn-deposit.ts` | manager | Deposit into Jupiter Earn. |
| `src/spot/earn-withdraw.ts` | manager | Withdraw from Jupiter Earn. |
| `src/spot/earn-extend-lut.ts` | manager | Pre-load the lookup table with Earn accounts. |
| `src/spot/earn-init-direct-withdraw.ts` | admin | Register Earn as a direct-withdraw strategy. |
| `src/spot/query-strategy-positions.ts` | read-only | Read Spot/Earn strategy positions. |

### Trustful
| File | Role | Purpose |
| --- | --- | --- |
| `src/trustful/arbitrary-init.ts` | manager | Initialize an arbitrary strategy. |
| `src/trustful/arbitrary-deposit.ts` | manager | Deposit into an arbitrary strategy. |
| `src/trustful/arbitrary-withdraw.ts` | manager | Withdraw from an arbitrary strategy. |
| `src/trustful/curve-init.ts` | manager | Initialize the curve strategy. |
| `src/trustful/curve-borrow.ts` | manager | Borrow against the curve strategy. |
| `src/trustful/curve-repay.ts` | manager | Repay the curve strategy. |
| `src/trustful/curve-remove.ts` | manager | Close the curve strategy. |

### Composition
| File | Role | Purpose |
| --- | --- | --- |
| `src/composition/allocate.ts` | manager | Sequence builders from >1 package through the shared processor. |

## Shared harness

`src/shared/harness.ts` is the examples' small `utils/` layer: it parses the
shared flags, loads the same profile the CLI uses, builds the RPC context with the
same precedence, loads signers from the `<ROLE>_KEYPAIR` env vars, and hands each
`BuiltOperation` to core's `processOperation`. `src/shared/jupiter.ts` resolves
the optional reward→asset route for the claim examples. `src/registry.ts` is the
catalog metadata + lazy loaders that power `pnpm examples:list` and
`pnpm example`. `src/index.ts` is the dispatcher. Example files never re-implement
builder logic.

## Public API discipline

Examples import **only documented package exports** — `@voltr/scripts-core` and
the integration entry points (`@voltr/scripts-kamino`, `@voltr/scripts-spot`,
`@voltr/scripts-trustful`). They never import `packages/*/src/*`,
`apps/cli/src/*`, or other private modules.

## Verifying the examples

`pnpm examples:check` runs two offline stages and is part of the canonical
`pnpm check`:

1. **Typecheck** (`tsc -p examples/tsconfig.json`, packages mapped to source) —
   catches drift between an example and a package's public surface.
2. **Runtime checks** (`tsx examples/scripts/check.ts`) — the registry has unique
   names that resolve to real modules; every example renders `--help` with no
   network or keypair; transaction examples default to `print`; offline-capable
   examples build a valid `BuiltOperation` against a fake RPC + generated signers
   (asserted with `assertBuiltOperationShape`); and no example source contains
   hard-coded keypair material or absolute developer paths.

Actually sending transactions (a real Kamino reserve flow, a live Jupiter swap,
`VOLTR_MODE=execute`) needs a funded keypair and a working RPC and is out of
scope for the automated check — run those manually.

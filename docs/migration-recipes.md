# Migration Recipes & Operator Guide

How to run the new CLI for the flows that used to be one-script-per-task in the
four legacy repos. For the old-script → command mapping, see
[parity-matrix.md](./parity-matrix.md). For the full per-command flag and
profile-field tables, see the [README](../README.md#commands); for the package
design, see [architecture.md](./architecture.md).

All examples use **neutral placeholders** — a `configs/my-vault.json` profile, a
generic USDC asset, `<...>` for addresses, and `/path/to/<role>.json` for
keypairs. Substitute your own values.

---

## 1. Setup

### Install

```bash
pnpm install
```

### Create a profile

A profile is one JSON file describing one vault deployment: its cluster, asset,
optional lookup table, and any integration addresses. **Routine operational
values live in the profile; per-call values are flags; secrets are never in the
profile.** Copy the example and edit it:

```bash
cp configs/examples/usdc.mainnet.example.json configs/my-vault.json
# edit configs/my-vault.json:
#   vault.assetMintAddress / vault.assetTokenProgram  (required)
#   vault.vaultAddress                                (leave empty until vault:init prints it)
#   integrations.<adapter>.*                          (only the adapters you use)
```

Profile shape (validated with zod on load — a missing/malformed field fails
before any RPC call, naming the offending field):

```jsonc
{
  "name": "my-vault",                   // required, non-empty
  "cluster": "mainnet-beta",            // localnet | devnet | mainnet-beta
  "rpcUrl": "",                         // optional fallback RPC (env/flag override it)
  "vault": {
    "name": "My USDC Vault",            // optional display label
    "assetMintAddress": "<ASSET_MINT>", // required
    "assetTokenProgram": "<TOKEN_PROGRAM>", // required (Token or Token-2022)
    "vaultAddress": "<VAULT_ADDRESS>",  // required by post-init vault:* commands; vault:init* generates it — leave empty until then
    "useLookupTable": false,
    "lookupTableAddress": "<LUT_ADDRESS>" // required only when useLookupTable is true
  },
  "integrations": {
    "kamino":   { "reserveAddress": "<RESERVE>", "kvaultAddress": "<KVAULT>", "directWithdrawDiscriminator": [/* 8 bytes */] },
    "spot":     { "foreignMintAddress": "<MINT>", "foreignTokenProgram": "<PROG>", "assetOracleAddress": "<ORACLE>", "foreignOracleAddress": "<ORACLE>", "directWithdrawDiscriminator": [/* 8 bytes */] },
    "trustful": { "strategySeedString": "<SEED>" }
  }
}
```

Empty strings / empty arrays mean "not provided" — only fill the integrations and
fields a command actually needs. Validate a freshly-edited profile (fully
offline, no RPC, no keypair):

```bash
pnpm cli -- --profile configs/my-vault.json check
```

> **Do not use deprecated product-specific vault/profile names** (e.g. legacy
> token brands) in committed profiles or examples. Use neutral names like
> `my-vault`.

### Keypairs & roles

Commands sign as one of three roles. Each resolves its keypair path from a flag,
falling back to an environment variable. **The flag wins;** if neither is set the
command fails up front, naming both:

| Role | Flag | Env var | Used by |
| --- | --- | --- | --- |
| `admin` | `--admin-keypair` | `ADMIN_KEYPAIR` | `vault:init*`, metadata, config, adaptor admin, harvest-fee |
| `manager` | `--manager-keypair` | `MANAGER_KEYPAIR` | strategy operations (Kamino/Spot/Trustful, claims) |
| `user` | `--user-keypair` | `USER_KEYPAIR` | deposit/withdraw, direct-withdraw |

Paths point to standard Solana JSON keypair files. **Safe handling:**

- No keypair material lives in profiles — only paths, via flag or env.
- Prefer env vars (set in a gitignored `.env`; copy `.env.example`) over flags so
  secret paths don't land in shell history.
- Keep keypair files outside the repo and restrict permissions (`chmod 600`).
- Transaction commands resolve the role keypair **before** dispatching the mode,
  so a valid keypair is required even for `--mode print` (it derives the signing
  authority for the instructions — nothing is signed or sent in `print`).
- The read-only `*:query:*` commands and `check` need **no** keypair.

```bash
# .env (gitignored) — set once:
RPC_URL=https://your-rpc
ADMIN_KEYPAIR=/path/to/admin.json
MANAGER_KEYPAIR=/path/to/manager.json
USER_KEYPAIR=/path/to/user.json
```

### RPC URL

Resolved in this order (first non-empty wins):

1. `--rpc-url <url>` flag
2. `RPC_URL` env
3. `HELIUS_RPC_URL` env
4. `rpcUrl` field in the profile

Every command **except `check`** builds an RPC-backed context up front, so a URL
must resolve from one of those — even `--mode print`, whose build phase still
reads chain state (only `check` runs without RPC). **Safe handling:** keep
authenticated RPC URLs (those embedding an API key) in env/`.env`, not in
committed profiles; leave `profile.rpcUrl` empty for shared profiles.

---

## 2. Transaction modes — verify before you execute

Every transaction command takes `--mode` (default `print`). The two `*:query:*`
commands and `check` ignore it.

**A command builds first, then dispatches the mode.** The build phase reads chain
state over RPC — `setupTokenAccount` checks whether a token account exists, Kamino
decodes reserve/vault state — and the swap commands (`spot:swap:buy`/`sell`, and a
Kamino `claim-reward*` given `--swap-amount`) also call the Jupiter API. **This runs
in every mode**, so a reachable RPC (and Jupiter, for swaps) is needed even for
`print` and `multisig`. `--mode` only controls what happens *with* the built
operation; `check` is the only fully offline command.

| Mode | Sends on-chain? | Network after the build | What it does with the built operation |
| --- | --- | --- | --- |
| `print` *(default)* | No | none | Prints `{ label, instructionCount, lookupTableAddresses }` + any operation metadata. The no-send preview. |
| `simulate` | No | one `simulateTransaction` RPC | Prints `OK`/`FAILED`, compute units, program logs, explorer URL. |
| `multisig` | No | none | Emits a base64 + base58 transaction message (compute-budget stripped) to import into a multisig (e.g. Squads) for the named on-chain signer. Nothing is sent. |
| `execute` | **Yes** | send + confirm | Signs with the role keypair, sends, confirms; prints the signature and compute units consumed. |

All four modes resolve a role keypair and an RPC URL up front (the build needs
them); `multisig` additionally requires `--multisig-address`.

**Recommended workflow — never `execute` blind:**

```bash
# 1. print: confirm the plan builds and the instruction/LUT counts look right
pnpm cli -- --profile configs/my-vault.json --mode print \
  vault:deposit --amount 1000000

# 2. simulate: confirm it would succeed on-chain (compute units + program logs)
pnpm cli -- --profile configs/my-vault.json --mode simulate \
  vault:deposit --amount 1000000

# 3. execute: send it for real
pnpm cli -- --profile configs/my-vault.json --mode execute \
  vault:deposit --amount 1000000
```

For a vault whose admin/manager is a multisig (e.g. Squads), swap step 3 for
`--mode multisig --multisig-address <VAULT_SIGNER_PDA>` and import the printed
payload into the multisig instead of signing locally.

> `vault:init*` cannot use `--mode multisig`: a fresh vault keypair must sign
> initialization and a multisig payload can't carry that signature. Use
> `--mode execute` (it rejects `multisig` with a clear error).

### Global options (all transaction commands)

| Option | Purpose |
| --- | --- |
| `--profile <path>` | Profile JSON to load (required). |
| `--rpc-url <url>` | RPC override (see precedence above). |
| `--mode <mode>` | `print` (default) / `simulate` / `multisig` / `execute`. |
| `--multisig-address <pubkey>` | On-chain signer PDA; required for `--mode multisig`. |
| `--priority-fee <kind>` | `helius` (default) / `rpc` / `fixed` / `none`. |
| `--priority-fee-micro-lamports <n>` | microLamports for `--priority-fee fixed`. |
| `--compute-unit-limit <n>` | Override the estimated compute-unit limit. |

---

## 3. Per-command flags

- **Global options** (above) apply to every transaction command.
- **Profile-sourced values** (vault address, asset mint/program, LUT, strategy
  reserve/kvault/oracles/seed) come from `--profile` — see the README command
  tables for which field each command reads.
- **Per-call values** (amounts, slippage, reward identity, destination, signer
  paths) are flags.
- Discover any command's exact flags from the CLI:

```bash
pnpm cli -- --help                 # global options + all command groups
pnpm cli -- vault:deposit --help   # flags for one command
```

---

## 4. Recipes (common flows)

Examples below assume `RPC_URL` and the role keypairs are set in `.env` (so no
explicit `--<role>-keypair`), and use `--mode execute`. **Run each with `--mode
print` then `--mode simulate` first** (§2).

### Initialize a vault

```bash
# 1. admin signs; manager is just an address (it does not sign init).
#    A fresh vault keypair is generated and its address printed.
pnpm cli -- --profile configs/my-vault.json --mode execute \
  vault:init --manager <MANAGER_PUBKEY> --name "My USDC Vault" --max-cap 100000000000

# 2. Record the printed "Generated vault address" as vault.vaultAddress in the profile.

# (alt) init + LP-token metadata in one transaction:
pnpm cli -- --profile configs/my-vault.json --mode execute \
  vault:init-and-set-token-metadata --manager <MANAGER_PUBKEY> --name "My USDC Vault" \
  --max-cap 100000000000 --metadata-name "My USDC Vault Token" --metadata-symbol MYUSDC \
  --metadata-uri https://example.com/metadata.json
```

`vault:init` accepts optional fee/duration flags (default `0`). It builds only
the init transaction — if you use a lookup table, populate it separately (see
[parity-matrix.md](./parity-matrix.md#optional-lut-extend-deferred)).

### Set metadata / update config

```bash
# Set or replace LP-token metadata later:
pnpm cli -- --profile configs/my-vault.json --mode execute \
  vault:set-token-metadata --metadata-name "My USDC Vault Token" \
  --metadata-symbol MYUSDC --metadata-uri https://example.com/metadata.json

# Update one config field per call (run --help for the field list):
pnpm cli -- --profile configs/my-vault.json --mode execute \
  vault:update-config --field max-cap --value 200000000000

# Accept a pending admin transfer (the pending admin signs):
pnpm cli -- --profile configs/my-vault.json --mode execute vault:accept-admin

# Harvest accrued fees to the manager:
pnpm cli -- --profile configs/my-vault.json --mode execute \
  vault:harvest-fee --manager <MANAGER_PUBKEY>
```

### Deposit / withdraw (user)

```bash
# Deposit the vault asset:
pnpm cli -- --profile configs/my-vault.json --mode execute \
  vault:deposit --amount 1000000

# Check a position (read-only — ignores --mode, no keypair):
pnpm cli -- --profile configs/my-vault.json \
  vault:query:position --user <USER_PUBKEY>

# Standard withdraw: request, wait the lock period, then claim:
pnpm cli -- --profile configs/my-vault.json --mode execute \
  vault:request-withdraw --amount 1000000      # or: --all, or --in-lp for an LP amount
pnpm cli -- --profile configs/my-vault.json --mode execute \
  vault:withdraw

# Cancel a pending request:
pnpm cli -- --profile configs/my-vault.json --mode execute \
  vault:cancel-request-withdraw

# Instant withdraw (no waiting period):
pnpm cli -- --profile configs/my-vault.json --mode execute \
  vault:instant-withdraw --amount 1000000      # or --all / --in-lp
```

### Add an adapter

Registering an adapter on a vault is a one-time **admin** step. `vault:add-adaptor`
defaults to the Kamino adaptor; pass `--adaptor-program` for the others.

```bash
# Kamino (default adaptor):
pnpm cli -- --profile configs/my-vault.json --mode execute vault:add-adaptor

# Spot:
pnpm cli -- --profile configs/my-vault.json --mode execute \
  vault:add-adaptor --adaptor-program EW35URAx3LiM13fFK3QxAXfGemHso9HWPixrv7YDY4AM

# Trustful:
pnpm cli -- --profile configs/my-vault.json --mode execute \
  vault:add-adaptor --adaptor-program 3pnpK9nrs1R65eMV1wqCXkDkhSgN18xb1G5pgYPwoZjJ

# Remove an adapter:
pnpm cli -- --profile configs/my-vault.json --mode execute \
  vault:remove-adaptor --adaptor-program 3pnpK9nrs1R65eMV1wqCXkDkhSgN18xb1G5pgYPwoZjJ

# Register a direct-withdraw strategy (Kamino kvault default + profile discriminator):
pnpm cli -- --profile configs/my-vault.json --mode execute vault:init-direct-withdraw
# For the Spot Earn strategy, use the Spot-specific command (derives the strategy for you):
pnpm cli -- --profile configs/my-vault.json --mode execute spot:earn:init-direct-withdraw
```

### Kamino market & kVault flows

Manager-signed; reserve/kvault come from `integrations.kamino.*`.

```bash
# Market reserve: init, deposit, withdraw
pnpm cli -- --profile configs/my-vault.json --mode execute kamino:market:init
pnpm cli -- --profile configs/my-vault.json --mode execute kamino:market:deposit --amount 1000000
pnpm cli -- --profile configs/my-vault.json --mode execute kamino:market:withdraw --amount 1000000

# kVault: init, deposit, withdraw
pnpm cli -- --profile configs/my-vault.json --mode execute kamino:kvault:init
pnpm cli -- --profile configs/my-vault.json --mode execute kamino:kvault:deposit --amount 1000000
pnpm cli -- --profile configs/my-vault.json --mode execute kamino:kvault:withdraw --amount 1000000

# Claim one resolved farm reward (omit --swap-amount when the reward mint == asset mint).
# Each call handles ONE farm/reward — the operator supplies the farm identity:
pnpm cli -- --profile configs/my-vault.json --mode execute \
  kamino:market:claim-reward \
  --reward-mint <REWARD_MINT> --farm-state <FARM_STATE> --user-state <USER_STATE> \
  --swap-amount <RAW_REWARD_AMOUNT> --slippage-bps 50
# Indexed variant (multi-reward farms):
pnpm cli -- --profile configs/my-vault.json --mode execute \
  kamino:kvault:claim-reward-with-index \
  --reward-mint <REWARD_MINT> --farm-state <FARM_STATE> --user-state <USER_STATE> \
  --reward-index 0 --swap-amount <RAW_REWARD_AMOUNT>

# User direct-withdraw from the kvault strategy (requires vault:init-direct-withdraw first):
pnpm cli -- --profile configs/my-vault.json --mode execute kamino:kvault:direct-withdraw
pnpm cli -- --profile configs/my-vault.json --mode execute \
  kamino:kvault:request-and-direct-withdraw --amount 1000000   # or --all / --in-lp
```

### Spot buy/sell & Earn flows

Manager-signed; foreign mint/oracles come from `integrations.spot.*`. Register
the Spot adaptor first (see [Add an adapter](#add-an-adapter)).

```bash
# Swap strategy: init, then buy (asset→foreign) / sell (foreign→asset)
pnpm cli -- --profile configs/my-vault.json --mode execute spot:swap:init
pnpm cli -- --profile configs/my-vault.json --mode execute \
  spot:swap:buy --amount 1000000 --slippage-bps 50
pnpm cli -- --profile configs/my-vault.json --mode execute \
  spot:swap:sell --amount 1000000 --slippage-bps 50 --jupiter-max-accounts 16

# Jupiter Earn: init (then extend-lut if you use a LUT), deposit, withdraw
pnpm cli -- --profile configs/my-vault.json --mode execute spot:earn:init
pnpm cli -- --profile configs/my-vault.json --mode execute spot:earn:extend-lut
pnpm cli -- --profile configs/my-vault.json --mode execute spot:earn:deposit --amount 1000000
pnpm cli -- --profile configs/my-vault.json --mode execute spot:earn:withdraw --amount 1000000

# Per-strategy positions, enriched with raw foreign-token balances (read-only):
pnpm cli -- --profile configs/my-vault.json spot:query:strategy-positions
```

> `spot:swap:sell` does a real foreign→asset swap. The legacy `manager-sell-spot.ts`
> had a bug that built no swap — simulate first to confirm the new behavior.

### Trustful arbitrary & curve flows

Manager-signed. The arbitrary strategy is named by
`integrations.trustful.strategySeedString`; the curve strategy is a per-vault
singleton (no seed flag). Register the Trustful adaptor first.

```bash
# Arbitrary strategy: init, deposit, withdraw.
# deposit prints the withdrawal-holding account — return assets there before withdrawing.
pnpm cli -- --profile configs/my-vault.json --mode execute trustful:arbitrary:init
pnpm cli -- --profile configs/my-vault.json --mode execute \
  trustful:arbitrary:deposit --amount 1000000 \
  --destination <DESTINATION_TOKEN_ACCOUNT> --position-value-after 1000000
pnpm cli -- --profile configs/my-vault.json --mode execute \
  trustful:arbitrary:withdraw --amount 1000000 --position-value-after 0

# Curve strategy: init, borrow, repay, remove
pnpm cli -- --profile configs/my-vault.json --mode execute trustful:curve:init
pnpm cli -- --profile configs/my-vault.json --mode execute \
  trustful:curve:borrow --amount 1000000 --borrow-rate-bps 50
pnpm cli -- --profile configs/my-vault.json --mode execute \
  trustful:curve:repay --amount 1000000 --borrow-rate-bps 50
pnpm cli -- --profile configs/my-vault.json --mode execute trustful:curve:remove
```

---

## 5. Complete command reference

One runnable `--mode print` example per command (the no-send preview — swap
`print` for `simulate`/`execute` once verified). Assumes the role keypair and
`RPC_URL` are set in `.env` (the build phase still needs a reachable RPC; see
§2). Profile-sourced fields are read from `configs/my-vault.json`; flags shown
are the per-call values.

### `vault:*`

```bash
pnpm cli -- --profile configs/my-vault.json --mode print vault:init --manager <MANAGER_PUBKEY> --name "My USDC Vault" --max-cap 100000000000
pnpm cli -- --profile configs/my-vault.json --mode print vault:init-and-set-token-metadata --manager <MANAGER_PUBKEY> --name "My USDC Vault" --max-cap 100000000000 --metadata-name "My USDC Vault Token" --metadata-symbol MYUSDC --metadata-uri https://example.com/metadata.json
pnpm cli -- --profile configs/my-vault.json --mode print vault:set-token-metadata --metadata-name "My USDC Vault Token" --metadata-symbol MYUSDC --metadata-uri https://example.com/metadata.json
pnpm cli -- --profile configs/my-vault.json --mode print vault:update-config --field max-cap --value 200000000000
pnpm cli -- --profile configs/my-vault.json --mode print vault:accept-admin
pnpm cli -- --profile configs/my-vault.json --mode print vault:harvest-fee --manager <MANAGER_PUBKEY>
pnpm cli -- --profile configs/my-vault.json --mode print vault:deposit --amount 1000000
pnpm cli -- --profile configs/my-vault.json --mode print vault:request-withdraw --amount 1000000
pnpm cli -- --profile configs/my-vault.json --mode print vault:cancel-request-withdraw
pnpm cli -- --profile configs/my-vault.json --mode print vault:withdraw
pnpm cli -- --profile configs/my-vault.json --mode print vault:instant-withdraw --amount 1000000
pnpm cli -- --profile configs/my-vault.json vault:query:position --user <USER_PUBKEY>
pnpm cli -- --profile configs/my-vault.json vault:query:strategy-positions
pnpm cli -- --profile configs/my-vault.json --mode print vault:add-adaptor
pnpm cli -- --profile configs/my-vault.json --mode print vault:remove-adaptor --adaptor-program 3pnpK9nrs1R65eMV1wqCXkDkhSgN18xb1G5pgYPwoZjJ
pnpm cli -- --profile configs/my-vault.json --mode print vault:init-direct-withdraw
```

### `kamino:*`

```bash
pnpm cli -- --profile configs/my-vault.json --mode print kamino:market:init
pnpm cli -- --profile configs/my-vault.json --mode print kamino:market:deposit --amount 1000000
pnpm cli -- --profile configs/my-vault.json --mode print kamino:market:withdraw --amount 1000000
pnpm cli -- --profile configs/my-vault.json --mode print kamino:market:claim-reward --reward-mint <REWARD_MINT> --farm-state <FARM_STATE> --user-state <USER_STATE>
pnpm cli -- --profile configs/my-vault.json --mode print kamino:market:claim-reward-with-index --reward-mint <REWARD_MINT> --farm-state <FARM_STATE> --user-state <USER_STATE> --reward-index 0
pnpm cli -- --profile configs/my-vault.json --mode print kamino:kvault:init
pnpm cli -- --profile configs/my-vault.json --mode print kamino:kvault:deposit --amount 1000000
pnpm cli -- --profile configs/my-vault.json --mode print kamino:kvault:withdraw --amount 1000000
pnpm cli -- --profile configs/my-vault.json --mode print kamino:kvault:claim-reward --reward-mint <REWARD_MINT> --farm-state <FARM_STATE> --user-state <USER_STATE>
pnpm cli -- --profile configs/my-vault.json --mode print kamino:kvault:claim-reward-with-index --reward-mint <REWARD_MINT> --farm-state <FARM_STATE> --user-state <USER_STATE> --reward-index 0
pnpm cli -- --profile configs/my-vault.json --mode print kamino:kvault:direct-withdraw
pnpm cli -- --profile configs/my-vault.json --mode print kamino:kvault:request-and-direct-withdraw --amount 1000000
```

### `spot:*`

```bash
pnpm cli -- --profile configs/my-vault.json --mode print spot:swap:init
pnpm cli -- --profile configs/my-vault.json --mode print spot:swap:buy --amount 1000000 --slippage-bps 50
pnpm cli -- --profile configs/my-vault.json --mode print spot:swap:sell --amount 1000000 --slippage-bps 50
pnpm cli -- --profile configs/my-vault.json --mode print spot:earn:init
pnpm cli -- --profile configs/my-vault.json --mode print spot:earn:extend-lut
pnpm cli -- --profile configs/my-vault.json --mode print spot:earn:deposit --amount 1000000
pnpm cli -- --profile configs/my-vault.json --mode print spot:earn:withdraw --amount 1000000
pnpm cli -- --profile configs/my-vault.json --mode print spot:earn:init-direct-withdraw
pnpm cli -- --profile configs/my-vault.json spot:query:strategy-positions
```

### `trustful:*`

```bash
pnpm cli -- --profile configs/my-vault.json --mode print trustful:arbitrary:init
pnpm cli -- --profile configs/my-vault.json --mode print trustful:arbitrary:deposit --amount 1000000 --destination <DESTINATION_TOKEN_ACCOUNT> --position-value-after 1000000
pnpm cli -- --profile configs/my-vault.json --mode print trustful:arbitrary:withdraw --amount 1000000 --position-value-after 0
pnpm cli -- --profile configs/my-vault.json --mode print trustful:curve:init
pnpm cli -- --profile configs/my-vault.json --mode print trustful:curve:borrow --amount 1000000 --borrow-rate-bps 50
pnpm cli -- --profile configs/my-vault.json --mode print trustful:curve:repay --amount 1000000 --borrow-rate-bps 50
pnpm cli -- --profile configs/my-vault.json --mode print trustful:curve:remove
```

### `check`

```bash
pnpm cli -- --profile configs/my-vault.json check
```

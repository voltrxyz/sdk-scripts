# Migration Plan

## 1. Shared Core

Move duplicated code from the old repos into `packages/core`:

- signer loading
- RPC/context creation
- optimized send/confirm
- lookup table fetching and extension helpers
- token account setup
- kit/web3 account-meta conversion
- common vault operations

The first migrated operation is `vault:deposit`, based on:

```text
../voltr-base-scripts/src/scripts/user-deposit-vault.ts
```

## 2. Thin Adapter Builders

Move adapter-specific PDA and remaining-account logic into integration packages:

```text
packages/kamino/src/operations/*
packages/spot/src/operations/*
packages/trustful/src/operations/*
```

Good first candidates:

- Kamino: `../voltr-kamino-scripts/src/scripts/manager-deposit-market.ts`
- Spot: `../voltr-spot-scripts/src/scripts/manager-initialize-spot.ts`
- Trustful: `../voltr-trustful-scripts/src/scripts/manager-deposit-arbitrary.ts`

Each migrated operation should expose a function named like:

```ts
buildKaminoDepositMarketOperation(ctx, args)
```

and return a `BuiltOperation`.

## 3. CLI Commands

After each operation builder is migrated, add a command under `apps/cli`.

Command naming should follow:

```text
vault:<action>
kamino:<strategy>:<action>
spot:<strategy>:<action>
trustful:<strategy>:<action>
```

Examples:

```text
vault:deposit
kamino:market:deposit
spot:earn:withdraw
trustful:curve:borrow
```

## 4. Deprecate Old Repos

Once an old script is migrated:

- keep the old script as a wrapper if needed
- point the README to this repo
- stop editing source config files for routine ops


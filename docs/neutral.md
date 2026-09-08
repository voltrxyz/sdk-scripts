# Neutral Trade bundles

The **Neutral adaptor** is `WpFotU6LNA9Rdk9rm1ZYNcaPCRXHZGRLVwxHXqcaRJG` on mainnet.
It calls the Neutral bundle program `BUNDDh4P5XviMm1f3gCvnq2qKx6TGosAGnoUK12e7cXU`.
A bundle address is the Voltr strategy address. The vault strategy authority is the Neutral depositor;
its asset ATA receives keeper settlements. This integration is for Neutral bundles, distinct from
Neutral-managed Kamino vaults.

## Configure and register

Copy `configs/examples/usdc.mainnet.example.json` to your own profile. Set
`vault.vaultAddress` and `integrations.neutral.bundleAddress`. Set the asset mint to the bundle's asset;
the example uses USDC. The adaptor supports the Classic Token Program. Add a vault lookup table to
the profile when needed; the shared processor handles transaction modes and compute estimates.

Use a read-only status query to inspect the bundle, derived depositor address, permissioned flag,
receipt version and balances without a signer:

```bash
pnpm cli -- --profile configs/neutral.json neutral:bundle:query:status
```

The vault **admin** registers the adaptor once per vault. The deployed vault whitelists this program ID;
the default `allow_any_adaptor = 0` policy accepts it.

```bash
pnpm cli -- --profile configs/neutral.json --mode simulate vault:add-adaptor --adaptor-program WpFotU6LNA9Rdk9rm1ZYNcaPCRXHZGRLVwxHXqcaRJG
```

The vault **manager** initializes the strategy with `neutral:bundle:init`. This creates the settlement ATA
and invokes the adaptor's `initialize` handler. For a permissioned bundle, the **Neutral bundle manager**
must first run `neutral:bundle:register-depositor`, using that manager's keypair with `--manager-keypair`.
That command invokes `initialize_permissioned_bundle_depositor` directly and registers the derived vault
strategy authority. The two managers may be different people.

```bash
# Permissioned bundles only; signs as the Neutral bundle manager.
pnpm cli -- --profile configs/neutral.json --mode simulate neutral:bundle:register-depositor --manager-keypair /path/to/bundle-manager.json
# Signs as the Voltr vault manager.
pnpm cli -- --profile configs/neutral.json --mode simulate neutral:bundle:init --manager-keypair /path/to/vault-manager.json
```

Transaction commands use `--manager-keypair` or `MANAGER_KEYPAIR`. In `--mode multisig`,
`--multisig-address` supplies the signing authority, including the Neutral manager for registration.
Preview each transaction with `--mode print`, then simulate. Use `--mode execute` to submit the operation;
simulation does not create the state needed by the next step. Complete each step before proceeding.

## Deposit and refresh

```bash
# Deposit 1 USDC (six decimals).
pnpm cli -- --profile configs/neutral.json --mode simulate neutral:bundle:deposit --amount 1000000
pnpm cli -- --profile configs/neutral.json neutral:bundle:query:status
pnpm cli -- --profile configs/neutral.json --mode simulate neutral:bundle:refresh
```

The adaptor's `deposit` calls Neutral's `request_deposit`. Tokens move directly from the strategy ATA
into Neutral's pending-deposit account, net of the deposit fee. The keeper later processes the request
and issues shares. `neutral:bundle:refresh` invokes `deposit(0)` to update vault accounting without adding
a deposit. Deposit amounts must be positive asset minor units; use the refresh command for zero.

## Request, wait and claim

```bash
# Request a gross redemption of 1 USDC, or use --all to request every share.
pnpm cli -- --profile configs/neutral.json --mode simulate neutral:bundle:request-withdraw --amount 1000000
pnpm cli -- --profile configs/neutral.json neutral:bundle:query:status
# After the keeper sends tokens to the strategy ATA:
pnpm cli -- --profile configs/neutral.json --mode simulate neutral:bundle:claim
```

`request-withdraw` invokes the adaptor's `request_withdraw` through the vault's withdraw instruction
with a custom discriminator. `--amount` is gross of Neutral's withdrawal fee and is converted to shares;
`--all` requests all shares. The options are mutually exclusive. A pending deposit, redemption or switch
must finish before another redemption request. Neutral also enforces lock-up, cooldown and processing rules.

Wait for keeper processing; reaching `withdrawalAvailableTimestamp` alone does not mean settlement occurred.
The query reports `pendingDeposit`, `pendingShares`, the estimated redemption value and `strategyAtaAmount`.
Positive strategy ATA tokens can be claimed independently of any other outstanding request.
`claim` invokes the adaptor's `withdraw` handler and the vault sweeps the **entire** strategy ATA balance
into idle. There is no amount limit on claim. The CLI rejects a claim when that balance is zero.
The balance may include refunds or other received tokens; it is not proof of one particular withdrawal.

Neutral is an asynchronous allocation, not instant liquidity. These commands do not create a user
instant-withdraw or direct-withdraw route, and do not run Neutral's keeper.

## Accounting and status

Strategy operations require a version-2 receipt. New strategies on the upgraded vault initialize at version 2.
A legacy receipt must migrate before Neutral settles funds into its strategy ATA; the tooling refuses to
operate a version-1 receipt and does not attempt migration automatically.

The adaptor reports shares net of accrued management/performance fees plus pending deposits, excluding the
strategy ATA. The vault accounts for that ATA using its cached balance. Refresh-before-claim and
claim-before-refresh both book the real withdrawal fee instead of a phantom loss.

`storedPositionValue` and `lastAccountingTimestamp` are the vault's saved accounting snapshot, not a fresh NAV.
`lastAccountedStrategyAtaAmount` is the cached ATA amount. `strategyAtaAmount` is the current token balance.
Status uses confirmed RPC reads that may span slots; query again after settlement or a claim before acting.
All amounts and timestamps in JSON are decimal strings, with token amounts in asset minor units.

## Programmatic use and tests

`@voltr/scripts-neutral` exports the six operation builders and `queryNeutralBundleStatus`.
Runnable public-API examples live in `examples/src/neutral`; list them with `pnpm examples:list`.
Builders return `BuiltOperation` and never send transactions. The shared processor handles print, simulation,
multisig export and execution. Run `pnpm check` for builder, CLI, profile, type, build and example checks.

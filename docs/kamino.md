# Kamino integration

The `kamino:*` commands operate two Kamino strategy domains on a Voltr vault:

- **market** (`kamino:market:*`) — lend the vault asset into a Kamino Lending
  (klend) reserve.
- **kvault** (`kamino:kvault:*`) — allocate the vault asset into a Kamino vault
  (kvault), covering both manager strategy operations and user direct-withdraws.

For runnable end-to-end workflows (always preview with `--mode print` /
`simulate` before `execute`), see the operator guide's
[Kamino market & kVault flows](./operator-guide.md#kamino-market--kvault-flows).
Run `pnpm cli -- <command> --help` for the exact flags and defaults of any
command.

## Commands

| Command | Role | Strategy field |
| --- | --- | --- |
| `kamino:market:init` / `deposit` / `withdraw` | manager | `reserveAddress` |
| `kamino:market:claim-reward[-with-index]` | manager | `reserveAddress` |
| `kamino:kvault:init` / `deposit` / `withdraw` | manager | `kvaultAddress` |
| `kamino:kvault:claim-reward[-with-index]` | manager | `kvaultAddress` |
| `kamino:kvault:direct-withdraw` | user | `kvaultAddress` |
| `kamino:kvault:request-and-direct-withdraw` | user | `kvaultAddress` |

Registering the Kamino adaptor and a direct-withdraw strategy
(`vault:add-adaptor`, `vault:init-direct-withdraw`) are generic vault operations
— see [adaptor-admin.md](./adaptor-admin.md). The CLI defaults those commands to
the Kamino adaptor and the profile's Kamino kvault.

The `-with-index` claim variants exist because a multi-reward farm needs the
reward slot — pass `--reward-index <n>`.

## Profile fields and flags

- **Profile** (`integrations.kamino.*`): `reserveAddress` (market strategy id),
  `kvaultAddress` (kvault strategy id), and `directWithdrawDiscriminator` — the
  8-byte adaptor instruction `vault:init-direct-withdraw` binds when using the
  default Kamino adaptor (a per-deployment value).
- **Flags** (per call): amount, reward identity (`--reward-mint`,
  `--farm-state`, `--user-state`), `--reward-index`, withdraw flags, and the
  optional Jupiter swap settings (`--swap-amount`, `--slippage-bps`,
  `--jupiter-max-accounts`).
- **Signers**: manager strategy operations use `--manager-keypair` /
  `MANAGER_KEYPAIR`; user direct-withdraws use `--user-keypair` / `USER_KEYPAIR`.

## Operational constraints

- **Each `claim-reward[-with-index]` call handles one already-resolved
  farm/reward.** You supply the farm identity per call (`--farm-state`,
  `--user-state`, `--reward-mint`); resolving which farms are claimable is
  operator-supplied. When `--swap-amount` is given and the reward mint differs
  from the vault asset mint, the reward→asset swap is routed through the Jupiter
  API while the operation is built. When the reward mint equals the asset mint,
  or `--swap-amount` is omitted, no swap is attached.
- **The `*:init` commands build only the initialization transaction.** There is
  no Kamino lookup-table-extension command; if the vault uses a lookup table,
  pre-load it as a separate step.

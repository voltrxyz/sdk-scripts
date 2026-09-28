# Changelog

## Unreleased

- Fix the protocol treasury constant: `PROTOCOL_TREASURY` now mirrors the live
  `Protocol.treasury` (`C7sE…`). The harvest instruction rejects any other
  address, so `vault:harvest-fee` failed onchain with the previous value.
- `buildHarvestFeeOperation` now takes `harvester` (any funded signer —
  harvest is permissionless), `vaultAdmin`, `manager`, and an optional
  `protocolTreasury`, matching the onchain accounts instead of assuming the
  signer is the vault admin. `vault:harvest-fee` gains `--vault-admin` and
  `--treasury` overrides.
- Add `protocol:query:fee-vaults` (every vault with a protocol fee, its
  recipients and accrued LP fees, plus the live protocol config) and
  `protocol:harvest-fee` (one harvest transaction per protocol-fee vault with
  the recipients read live from chain), backed by `queryProtocolConfig` /
  `queryProtocolFeeVaults` in core, with matching examples.
- Token-account setup now always emits the idempotent create instruction (an
  onchain no-op when the account exists) instead of probing the chain. This
  fixes the base58 `>128 bytes` RPC error every builder hit when a checked
  token account already existed, drops `rpc` from `setupTokenAccount`'s
  arguments, and makes deposit, withdraw, harvest, and most init builders
  fully offline in `print` mode.
- Cover the full public builder surface with runnable examples: vault admin
  (metadata, config, admin transfer, fee harvest), adaptor add/remove and
  direct-withdraw registration, and protocol-admin operations.
- Emit complete unsigned legacy or v0 transactions from multisig mode so
  Squads can deserialize Base58 imports.
- Fetch a recent blockhash before building a multisig transaction.
- Report the serialized transaction size and reject payloads above Solana's
  transaction size limit.

## Neutral bundle integration

- Add Neutral operation builders, profile validation, CLI commands and programmatic examples.
- Validate foreign accounts and version-2 receipts; expose pending requests and available settlement tokens.
- Add permissioned registration by the Neutral manager and separate withdrawal request and claim flows.

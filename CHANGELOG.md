# Changelog

## Unreleased

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

# Changelog

## Unreleased

- Cover the full public builder surface with runnable examples: vault admin
  (metadata, config, admin transfer, fee harvest), adaptor add/remove and
  direct-withdraw registration, and protocol-admin operations.
- Emit complete unsigned legacy or v0 transactions from multisig mode so
  Squads can deserialize Base58 imports.
- Fetch a recent blockhash before building a multisig transaction.
- Report the serialized transaction size and reject payloads above Solana's
  transaction size limit.

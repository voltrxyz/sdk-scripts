# Neutral operation builders

Kit-native Neutral bundle operations for the Voltr CLI and programmatic callers.
See [the operator guide](../../docs/neutral.md) for setup, lifecycle and examples.

The package owns account derivation, validated account loading, generated decoders, operation builders
and read-only status queries. Vault instruction builders come from `@voltr/vault-sdk`.

## Generated account interfaces

`idl/ntbundle.json` contains unchanged Bundle, UserBundleAccount, OracleData and ReferralTier definitions,
account discriminators and the permissioned registration instruction extracted from the tested
`voltr-neutral-adaptor/idl/ntbundle.json` at commit `9185a3056439f7ea22bfa7840bcdf553c4bcf914`.
`idl/voltr_vault.json` contains the StrategyInitReceipt definition and discriminator from vault commit
`79730a9495b69324ff320a919dffeed19b8b7d0a`. The installed vault SDK 2.1.1 treats the cached balance as reserved
bytes, so this package uses the generated receipt decoder to read version-2 accounting accurately.

Regenerate with `pnpm --filter @voltr/scripts-neutral generate` from the repository root.
`codama.mjs` adds explicit NodeNext import extensions after rendering. Generated files are committed so
normal builds do not require code generation.

The Codama renderer is pinned to 2.1.0 with a matching node/visitor toolchain in the root pnpm overrides:
newer renderers reference client types absent from this repository's Kit 6, and newer node schemas are
incompatible with the pinned renderer. Upgrade these together when the workspace moves to a compatible Kit.

Run `pnpm check` from the root. The foreign-account fixtures in tests are encoded using the vendored layouts;
tests check account validation, instruction bytes/order, permissioned setup and asynchronous status handling.

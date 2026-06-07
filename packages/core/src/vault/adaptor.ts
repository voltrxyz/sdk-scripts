import {
  type Address,
  type KeyPairSigner,
  type ReadonlyUint8Array,
} from "@solana/kit";
import {
  getAddAdaptorInstructionAsync,
  getInitializeDirectWithdrawStrategyInstructionAsync,
  getRemoveAdaptorInstructionAsync,
} from "@voltr/vault-sdk";
import type { BuiltOperation, ScriptContext } from "../types.js";

/**
 * Generic adaptor-administration builders.
 *
 * Adding/removing an adaptor and initializing a direct-withdraw strategy are
 * vault-level operations whose instructions come from the base
 * `@voltr/vault-sdk`, not from any adapter SDK. They are identical for every
 * adapter (Kamino, Spot, Trustful) apart from the adaptor program ID, so they
 * live here in core and take `adaptorProgram` (and, for direct-withdraw,
 * `strategy` + the adaptor's `instructionDiscriminator`) as parameters. No
 * adapter program ID is hardcoded in core; the caller passes the adapter
 * package's exported constant (e.g. `KAMINO_ADAPTOR_PROGRAM_ID`,
 * `SPOT_ADAPTOR_PROGRAM_ID`, `TRUSTFUL_ADAPTOR_PROGRAM_ID`) or a profile value.
 *
 * See docs/adaptor-admin.md for the generic-vs-adapter-specific split and the
 * CLI command surface.
 */

export interface AddAdaptorArgs {
  /** Vault admin; pays for the adaptor-add receipt account and signs the change. */
  admin: KeyPairSigner;
  vault: Address;
  /** Adaptor program to register on the vault (adapter-package constant or profile value). */
  adaptorProgram: Address;
  lookupTableAddresses?: Address[];
}

/**
 * `vault:add-adaptor` — register an adaptor program on a vault so the manager can
 * later route strategy CPIs through it. Adapter-agnostic: pass the adaptor
 * program ID (and, optionally, the vault's lookup table).
 *
 * This builds only the add-adaptor transaction. Pre-loading a lookup table with
 * this instruction's accounts is multi-transaction orchestration, which the
 * operation-builder contract defers to the CLI/processor layer
 * (docs/architecture.md rule 8 — same as `buildInitVaultOperation`). The building
 * blocks live in core (`buildExtendLookupTableInstructions`,
 * `collectInstructionAddresses`). Compiling this transaction against an
 * *existing* LUT is supported via `lookupTableAddresses`.
 */
export async function buildAddAdaptorOperation(
  _ctx: ScriptContext,
  args: AddAdaptorArgs
): Promise<BuiltOperation> {
  const addAdaptorIx = await getAddAdaptorInstructionAsync({
    payer: args.admin,
    admin: args.admin,
    vault: args.vault,
    adaptorProgram: args.adaptorProgram,
  });

  return {
    label: "vault:add-adaptor",
    instructions: [addAdaptorIx],
    lookupTableAddresses: args.lookupTableAddresses,
  };
}

export interface RemoveAdaptorArgs {
  /** Vault admin; signs the change. The SDK does not require a separate payer. */
  admin: KeyPairSigner;
  vault: Address;
  /** Adaptor program to deregister from the vault. */
  adaptorProgram: Address;
  lookupTableAddresses?: Address[];
}

/**
 * `vault:remove-adaptor` — deregister an adaptor program from a vault. A generic
 * vault primitive that applies to any adaptor.
 */
export async function buildRemoveAdaptorOperation(
  _ctx: ScriptContext,
  args: RemoveAdaptorArgs
): Promise<BuiltOperation> {
  const removeAdaptorIx = await getRemoveAdaptorInstructionAsync({
    admin: args.admin,
    vault: args.vault,
    adaptorProgram: args.adaptorProgram,
  });

  return {
    label: "vault:remove-adaptor",
    instructions: [removeAdaptorIx],
    lookupTableAddresses: args.lookupTableAddresses,
  };
}

export interface InitDirectWithdrawStrategyArgs {
  /** Vault admin; pays for the direct-withdraw init receipt and signs. */
  admin: KeyPairSigner;
  vault: Address;
  /**
   * Strategy the direct-withdraw flow targets. Adapter-specific: for Kamino this
   * is the kvault address (a profile value); for Spot it is the derived Jupiter
   * `lending` PDA (see `buildSpotEarnInitDirectWithdrawOperation`, which derives
   * it before delegating here).
   */
  strategy: Address;
  /** Adaptor program that owns the strategy. */
  adaptorProgram: Address;
  /**
   * The adaptor instruction the direct-withdraw flow invokes, as an 8-byte
   * discriminator. A per-deployment value. Accepts a `Uint8Array` or a plain
   * number array; copied before use.
   */
  instructionDiscriminator: ReadonlyUint8Array | readonly number[];
  /** Extra adaptor args forwarded to the instruction. Defaults to none. */
  additionalArgs?: ReadonlyUint8Array | null;
  /** Whether the direct-withdraw flow accepts caller-supplied args. Defaults to false. */
  allowUserArgs?: boolean;
  lookupTableAddresses?: Address[];
}

/**
 * `vault:init-direct-withdraw` — register a direct-withdraw strategy on the
 * vault, binding it to an adaptor instruction discriminator.
 *
 * Generic across adapters: the only adapter-specific input is `strategy` (and
 * the per-deployment `instructionDiscriminator`), both passed in. Kamino can call
 * this directly with `strategy = kvault`; Spot derives its strategy first via
 * `buildSpotEarnInitDirectWithdrawOperation`.
 */
export async function buildInitDirectWithdrawStrategyOperation(
  _ctx: ScriptContext,
  args: InitDirectWithdrawStrategyArgs
): Promise<BuiltOperation> {
  const initializeDirectWithdrawIx =
    await getInitializeDirectWithdrawStrategyInstructionAsync({
      payer: args.admin,
      admin: args.admin,
      vault: args.vault,
      strategy: args.strategy,
      adaptorProgram: args.adaptorProgram,
      // Copy so each instruction owns its bytes (constants are shared/readonly).
      instructionDiscriminator: new Uint8Array(args.instructionDiscriminator),
      additionalArgs: args.additionalArgs ?? null,
      allowUserArgs: args.allowUserArgs ?? false,
    });

  return {
    label: "vault:init-direct-withdraw",
    instructions: [initializeDirectWithdrawIx],
    lookupTableAddresses: args.lookupTableAddresses,
  };
}

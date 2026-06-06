import assert from "node:assert/strict";
import { address, type Address, type Instruction } from "@solana/kit";
import type { ScriptContext, BuiltOperation, SolanaRpc } from "./types.js";
import type { ScriptProfile } from "./profile.js";

/**
 * Offline test helpers for exercising operation builders without a live RPC,
 * keypairs, or a real profile. Import from `@voltr/scripts-core/testing`.
 *
 * These exist so adapter packages (kamino, spot, trustful) can add builder
 * tests that follow the same shape contract enforced on `vault:*` builders.
 * See docs/testing.md for the recommended adapter test pattern.
 */

// Valid base58 placeholders. Builders MUST NOT read `ctx.profile` (see the
// operation-builder contract in docs/architecture.md), so the exact values here
// never affect a builder's output — they only need to satisfy the types.
const FAKE_ASSET_MINT = address("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
const FAKE_TOKEN_PROGRAM = address(
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
);

// Truthy stand-in for an existing account. `setupTokenAccount` (and most
// builders) only test `getAccountInfo(...).value` for existence.
const FAKE_ACCOUNT_INFO = { lamports: 1n };

export interface FakeRpcOptions {
  /**
   * Addresses that should report as already existing. Any address NOT listed
   * resolves to `{ value: null }`, which makes idempotent-create helpers emit a
   * create instruction (exercising more of the builder).
   */
  existingAccounts?: Iterable<Address | string>;
  /** Full override of `getAccountInfo(addr).send()`. Takes precedence. */
  getAccountInfo?: (account: Address) => { value: unknown };
}

/**
 * Minimal stand-in for a `SolanaRpc` covering the read paths builders use today
 * (`getAccountInfo`). It performs no network I/O. Add methods here as adapter
 * builders begin to need them, or pass `getAccountInfo` to customize behavior.
 */
export function createFakeRpc(options: FakeRpcOptions = {}): SolanaRpc {
  const existing = new Set<string>();
  for (const account of options.existingAccounts ?? []) {
    existing.add(String(account));
  }

  const rpc = {
    getAccountInfo(account: Address) {
      return {
        send: async () =>
          options.getAccountInfo
            ? options.getAccountInfo(account)
            : { value: existing.has(String(account)) ? FAKE_ACCOUNT_INFO : null },
      };
    },
  };

  return rpc as unknown as SolanaRpc;
}

export interface FakeScriptContextOptions {
  /** Override the stub profile. Builders should not read it, but queries may. */
  profile?: ScriptProfile;
  /** Override the fake RPC entirely. */
  rpc?: SolanaRpc;
  /** Placeholder RPC URL (never dialed by offline tests). */
  rpcUrl?: string;
  /** Forwarded to `createFakeRpc` when `rpc` is not supplied. */
  existingAccounts?: Iterable<Address | string>;
}

/**
 * Builds a `ScriptContext` backed by `createFakeRpc`, suitable for calling an
 * operation builder in an offline test.
 */
export function createFakeScriptContext(
  options: FakeScriptContextOptions = {}
): ScriptContext {
  const profile: ScriptProfile = options.profile ?? {
    name: "fake-profile",
    cluster: "devnet",
    vault: {
      assetMintAddress: FAKE_ASSET_MINT,
      assetTokenProgram: FAKE_TOKEN_PROGRAM,
    },
  };

  return {
    profile,
    rpcUrl: options.rpcUrl ?? "http://localhost:8899",
    rpc:
      options.rpc ?? createFakeRpc({ existingAccounts: options.existingAccounts }),
  };
}

export interface ExpectedOperationShape {
  /** If set, `operation.label` must equal this (the CLI command name). */
  label?: string;
  /** Minimum number of instructions expected. Defaults to 1. */
  minInstructions?: number;
}

/**
 * Asserts that a value conforms to the `BuiltOperation` contract: a non-empty
 * string label, a non-empty array of well-formed kit instructions, and
 * correctly-typed optional `lookupTableAddresses` / `computeUnitLimit`.
 *
 * This is the shared assertion adapter builder tests should use once their
 * builder is implemented (see docs/testing.md).
 */
export function assertBuiltOperationShape(
  operation: BuiltOperation,
  expected: ExpectedOperationShape = {}
): void {
  assert.ok(
    operation && typeof operation === "object",
    "operation must be an object"
  );

  assert.equal(
    typeof operation.label,
    "string",
    "operation.label must be a string"
  );
  assert.ok(operation.label.length > 0, "operation.label must be non-empty");
  if (expected.label !== undefined) {
    assert.equal(
      operation.label,
      expected.label,
      `operation.label must equal "${expected.label}"`
    );
  }

  assert.ok(
    Array.isArray(operation.instructions),
    "operation.instructions must be an array"
  );
  const minInstructions = expected.minInstructions ?? 1;
  assert.ok(
    operation.instructions.length >= minInstructions,
    `operation.instructions must contain at least ${minInstructions} instruction(s)`
  );

  operation.instructions.forEach((instruction: Instruction, index) => {
    assert.ok(
      instruction && typeof instruction === "object",
      `instruction[${index}] must be an object`
    );
    assert.equal(
      typeof instruction.programAddress,
      "string",
      `instruction[${index}].programAddress must be a base58 string`
    );
    assert.ok(
      instruction.programAddress.length > 0,
      `instruction[${index}].programAddress must be non-empty`
    );
    if (instruction.accounts !== undefined) {
      assert.ok(
        Array.isArray(instruction.accounts),
        `instruction[${index}].accounts must be an array when present`
      );
    }
    if (instruction.data !== undefined) {
      assert.ok(
        instruction.data instanceof Uint8Array,
        `instruction[${index}].data must be a Uint8Array when present`
      );
    }
  });

  if (operation.lookupTableAddresses !== undefined) {
    assert.ok(
      Array.isArray(operation.lookupTableAddresses),
      "operation.lookupTableAddresses must be an array when present"
    );
  }

  if (
    operation.computeUnitLimit !== undefined &&
    operation.computeUnitLimit !== null
  ) {
    assert.equal(
      typeof operation.computeUnitLimit,
      "number",
      "operation.computeUnitLimit must be a number, null, or undefined"
    );
  }
}

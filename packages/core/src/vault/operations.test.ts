import { test } from "node:test";
import assert from "node:assert/strict";
import { address, generateKeyPairSigner } from "@solana/kit";
import {
  assertBuiltOperationShape,
  createFakeRpc,
  createFakeScriptContext,
} from "../testing.js";
import { buildDepositVaultOperation } from "./operations.js";

const USDC = address("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
const TOKEN_PROGRAM = address("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const NATIVE_MINT = address("So11111111111111111111111111111111111111112");
const VAULT = address("11111111111111111111111111111111");
const LUT = address("ComputeBudget111111111111111111111111111111");

test("buildDepositVaultOperation builds a vault:deposit op for an SPL asset", async () => {
  // Fake RPC reports every account as missing, so the LP ATA create is emitted.
  const ctx = createFakeScriptContext();
  const user = await generateKeyPairSigner();

  const operation = await buildDepositVaultOperation(ctx, {
    user,
    vault: VAULT,
    assetMint: USDC,
    assetTokenProgram: TOKEN_PROGRAM,
    amount: 1_000_000n,
  });

  assertBuiltOperationShape(operation, {
    label: "vault:deposit",
    minInstructions: 2,
  });
  // create LP ATA (missing) + deposit
  assert.equal(operation.instructions.length, 2);
  assert.equal(operation.lookupTableAddresses, undefined);
});

test("buildDepositVaultOperation passes lookupTableAddresses through unchanged", async () => {
  const ctx = createFakeScriptContext();
  const user = await generateKeyPairSigner();

  const operation = await buildDepositVaultOperation(ctx, {
    user,
    vault: VAULT,
    assetMint: USDC,
    assetTokenProgram: TOKEN_PROGRAM,
    amount: 1_000_000n,
    lookupTableAddresses: [LUT],
  });

  assert.deepEqual(operation.lookupTableAddresses, [LUT]);
});

test("buildDepositVaultOperation skips the LP ATA create when it already exists", async () => {
  // Every account reports as existing -> setupTokenAccount adds no create ix.
  const ctx = createFakeScriptContext({
    rpc: createFakeRpc({ getAccountInfo: () => ({ value: { lamports: 1n } }) }),
  });
  const user = await generateKeyPairSigner();

  const operation = await buildDepositVaultOperation(ctx, {
    user,
    vault: VAULT,
    assetMint: USDC,
    assetTokenProgram: TOKEN_PROGRAM,
    amount: 1_000_000n,
  });

  assertBuiltOperationShape(operation, { label: "vault:deposit" });
  // deposit only
  assert.equal(operation.instructions.length, 1);
});

test("buildDepositVaultOperation wraps SOL for the native mint", async () => {
  const ctx = createFakeScriptContext();
  const user = await generateKeyPairSigner();

  const operation = await buildDepositVaultOperation(ctx, {
    user,
    vault: VAULT,
    assetMint: NATIVE_MINT,
    assetTokenProgram: TOKEN_PROGRAM,
    amount: 1_000_000n,
  });

  // create wSOL ATA + transfer SOL + sync native + create LP ATA + deposit + close
  assertBuiltOperationShape(operation, {
    label: "vault:deposit",
    minInstructions: 6,
  });
  assert.equal(operation.instructions.length, 6);
});

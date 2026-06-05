import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AccountRole,
  address,
  generateKeyPairSigner,
  type Address,
  type Instruction,
  type KeyPairSigner,
} from "@solana/kit";
import { COMPUTE_BUDGET_PROGRAM_ADDRESS } from "@solana-program/compute-budget";
import type { BuiltOperation, ScriptContext } from "../types.js";
import { processOperation } from "./processor.js";

const NOOP_PROGRAM = address("11111111111111111111111111111112");
const FAKE_VAULT = address("11111111111111111111111111111111");

async function makeSigner(): Promise<KeyPairSigner> {
  return generateKeyPairSigner();
}

function makeOperation(label = "test:op"): BuiltOperation {
  const dummyIx: Instruction = {
    programAddress: NOOP_PROGRAM,
    accounts: [
      {
        address: FAKE_VAULT,
        role: AccountRole.WRITABLE,
      },
    ],
    data: new Uint8Array([0, 1, 2, 3]),
  };
  return { label, instructions: [dummyIx] };
}

function makeCtx(): ScriptContext {
  // The print and multisig branches never touch ctx.rpc, so a stub is enough.
  return {
    profile: {
      name: "test",
      cluster: "devnet",
      vault: {
        assetMintAddress: NOOP_PROGRAM,
        assetTokenProgram: NOOP_PROGRAM,
        vaultAddress: FAKE_VAULT,
      },
    },
    rpcUrl: "http://localhost:9999",
    rpc: {} as ScriptContext["rpc"],
  };
}

test("processOperation dispatches print mode without touching RPC", async () => {
  const ctx = makeCtx();
  const payer = await makeSigner();
  const operation = makeOperation("vault:deposit");

  const logs: string[] = [];
  const originalLog = console.log;
  console.log = (msg?: unknown) => logs.push(String(msg));
  try {
    const result = await processOperation({
      ctx,
      payer,
      operation,
      mode: "print",
    });

    assert.equal(result.mode, "print");
    if (result.mode !== "print") return;
    assert.equal(result.label, "vault:deposit");
    assert.equal(result.instructionCount, 1);
    assert.deepEqual(result.lookupTableAddresses, []);
    assert.ok(logs.some((line) => line.includes("vault:deposit")));
  } finally {
    console.log = originalLog;
  }
});

test("processOperation dispatches multisig mode and emits base58 + base64", async () => {
  const ctx = makeCtx();
  const payer = await makeSigner();
  const operation = makeOperation("vault:withdraw");
  const multisigAddress = address(
    "BPFLoaderUpgradeab1e11111111111111111111111"
  ) as Address;

  const logs: string[] = [];
  const originalLog = console.log;
  console.log = (msg?: unknown) => logs.push(String(msg));
  try {
    const result = await processOperation({
      ctx,
      payer,
      operation,
      mode: "multisig",
      options: { multisigAddress, quiet: true },
    });

    assert.equal(result.mode, "multisig");
    if (result.mode !== "multisig") return;
    assert.ok(result.base64Message.length > 0);
    assert.ok(result.base58Message.length > 0);
    assert.notEqual(result.base64Message, result.base58Message);
    assert.ok(result.explorerUrl.startsWith("https://explorer.solana.com"));
  } finally {
    console.log = originalLog;
  }
});

test("processOperation multisig mode requires multisigAddress option", async () => {
  const ctx = makeCtx();
  const payer = await makeSigner();
  const operation = makeOperation();

  await assert.rejects(
    () =>
      processOperation({
        ctx,
        payer,
        operation,
        mode: "multisig",
      }),
    /\[test:op\/multisig\].*multisigAddress/
  );
});

test("processOperation multisig mode strips compute-budget instructions", async () => {
  const ctx = makeCtx();
  const payer = await makeSigner();
  const operation: BuiltOperation = {
    label: "with-cu",
    instructions: [
      {
        programAddress: COMPUTE_BUDGET_PROGRAM_ADDRESS,
        accounts: [],
        data: new Uint8Array([0, 0, 0, 0]),
      },
      ...makeOperation().instructions,
    ],
  };

  const multisigAddress = address(
    "BPFLoaderUpgradeab1e11111111111111111111111"
  ) as Address;

  const logs: string[] = [];
  const originalLog = console.log;
  console.log = (msg?: unknown) => logs.push(String(msg));
  try {
    const stripped = await processOperation({
      ctx,
      payer,
      operation,
      mode: "multisig",
      options: { multisigAddress, quiet: true },
    });
    const unstrippedOp: BuiltOperation = {
      ...operation,
      label: "with-cu-ref",
    };
    const reference = await processOperation({
      ctx,
      payer,
      operation: {
        ...unstrippedOp,
        // Only the non-CU instruction, to compare against the stripped output.
        instructions: makeOperation().instructions,
      },
      mode: "multisig",
      options: { multisigAddress, quiet: true },
    });

    assert.equal(stripped.mode, "multisig");
    assert.equal(reference.mode, "multisig");
    if (stripped.mode !== "multisig" || reference.mode !== "multisig") return;
    assert.equal(stripped.base64Message, reference.base64Message);
  } finally {
    console.log = originalLog;
  }
});

test("processOperation print mode does not require RPC or signer secrets", async () => {
  const ctx = makeCtx();
  const payer = await makeSigner();
  const operation = makeOperation("vault:deposit");

  const result = await processOperation({
    ctx,
    payer,
    operation,
    mode: "print",
  });
  assert.equal(result.mode, "print");
  if (result.mode !== "print") return;
  assert.deepEqual(result.lookupTableAddresses, []);
});

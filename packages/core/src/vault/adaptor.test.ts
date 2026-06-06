import { test } from "node:test";
import assert from "node:assert/strict";
import {
  generateKeyPairSigner,
  type Address,
  type KeyPairSigner,
} from "@solana/kit";
import { assertBuiltOperationShape, createFakeScriptContext } from "../testing.js";
import {
  buildAddAdaptorOperation,
  buildInitDirectWithdrawStrategyOperation,
  buildRemoveAdaptorOperation,
} from "./adaptor.js";

// A stand-in adaptor program. The builders treat it as an opaque account, so any
// valid address exercises the wiring.
const ADAPTOR_PROGRAM = "to6Eti9CsC5FGkAtqiPphvKD2hiQiLsS8zWiDBqBPKR" as Address;
const DIRECT_WITHDRAW_DISCRIMINATOR = [135, 7, 237, 120, 149, 94, 95, 7];

async function makeSigner(): Promise<KeyPairSigner> {
  return generateKeyPairSigner();
}

async function makeAddress(): Promise<Address> {
  return (await generateKeyPairSigner()).address;
}

function accountAddresses(
  accounts: readonly { address: string }[] | undefined
): string[] {
  return (accounts ?? []).map((account) => account.address);
}

test("add-adaptor builds a single instruction referencing the adaptor program", async () => {
  const ctx = createFakeScriptContext();
  const admin = await makeSigner();
  const vault = await makeAddress();
  const lut = await makeAddress();

  const op = await buildAddAdaptorOperation(ctx, {
    admin,
    vault,
    adaptorProgram: ADAPTOR_PROGRAM,
    lookupTableAddresses: [lut],
  });

  assertBuiltOperationShape(op, { label: "vault:add-adaptor" });
  assert.equal(op.instructions.length, 1);
  assert.deepEqual(op.lookupTableAddresses, [lut]);
  // The adaptor program must actually be threaded into the instruction.
  assert.ok(
    accountAddresses(op.instructions[0].accounts).includes(ADAPTOR_PROGRAM),
    "expected the adaptor program among the add-adaptor accounts"
  );
});

test("remove-adaptor builds a single instruction referencing the adaptor program", async () => {
  const ctx = createFakeScriptContext();
  const admin = await makeSigner();
  const vault = await makeAddress();

  const op = await buildRemoveAdaptorOperation(ctx, {
    admin,
    vault,
    adaptorProgram: ADAPTOR_PROGRAM,
  });

  assertBuiltOperationShape(op, { label: "vault:remove-adaptor" });
  assert.equal(op.instructions.length, 1);
  assert.ok(
    accountAddresses(op.instructions[0].accounts).includes(ADAPTOR_PROGRAM),
    "expected the adaptor program among the remove-adaptor accounts"
  );
});

test("init-direct-withdraw accepts both number[] and Uint8Array discriminators", async () => {
  const ctx = createFakeScriptContext();
  const admin = await makeSigner();
  const vault = await makeAddress();
  const strategy = await makeAddress();
  const lut = await makeAddress();

  const fromArray = await buildInitDirectWithdrawStrategyOperation(ctx, {
    admin,
    vault,
    strategy,
    adaptorProgram: ADAPTOR_PROGRAM,
    instructionDiscriminator: DIRECT_WITHDRAW_DISCRIMINATOR,
    lookupTableAddresses: [lut],
  });

  assertBuiltOperationShape(fromArray, { label: "vault:init-direct-withdraw" });
  assert.equal(fromArray.instructions.length, 1);
  assert.deepEqual(fromArray.lookupTableAddresses, [lut]);
  // The strategy and adaptor program are both threaded into the instruction.
  const accounts = accountAddresses(fromArray.instructions[0].accounts);
  assert.ok(accounts.includes(strategy), "expected the strategy account");
  assert.ok(accounts.includes(ADAPTOR_PROGRAM), "expected the adaptor program account");
  // Instruction data carries the encoded discriminator (non-empty).
  assert.ok(
    fromArray.instructions[0].data instanceof Uint8Array &&
      fromArray.instructions[0].data.length > 0,
    "expected encoded instruction data"
  );

  const fromTypedArray = await buildInitDirectWithdrawStrategyOperation(ctx, {
    admin,
    vault,
    strategy,
    adaptorProgram: ADAPTOR_PROGRAM,
    instructionDiscriminator: new Uint8Array(DIRECT_WITHDRAW_DISCRIMINATOR),
  });
  assertBuiltOperationShape(fromTypedArray, {
    label: "vault:init-direct-withdraw",
  });
  // Both encodings must produce identical instruction data.
  assert.deepEqual(
    fromTypedArray.instructions[0].data,
    fromArray.instructions[0].data
  );
});

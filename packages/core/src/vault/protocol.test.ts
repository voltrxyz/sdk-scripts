import { test } from "node:test";
import assert from "node:assert/strict";
import {
  generateKeyPairSigner,
  type Address,
  type KeyPairSigner,
} from "@solana/kit";
import { assertBuiltOperationShape, createFakeScriptContext } from "../testing.js";
import {
  buildAcceptProtocolAdminOperation,
  buildSetPendingProtocolAdminOperation,
  buildUpdateProtocolTreasuryOperation,
  buildUpdateVaultAdaptorPolicyOperation,
} from "./protocol.js";

async function makeSigner(): Promise<KeyPairSigner> {
  return generateKeyPairSigner();
}

async function makeAddress(): Promise<Address> {
  return (await generateKeyPairSigner()).address;
}

function accountAddresses(
  accounts: readonly { address: string }[] | undefined
): Array<string> {
  return (accounts ?? []).map((account) => account.address);
}

test("protocol treasury update builds a protocol-admin signed instruction", async () => {
  const ctx = createFakeScriptContext();
  const admin = await makeSigner();
  const treasury = await makeAddress();
  const lookupTable = await makeAddress();

  const operation = await buildUpdateProtocolTreasuryOperation(ctx, {
    admin,
    treasury,
    lookupTableAddresses: [lookupTable],
  });

  assertBuiltOperationShape(operation, { label: "protocol:update-treasury" });
  assert.equal(operation.instructions.length, 1);
  assert.deepEqual(operation.lookupTableAddresses, [lookupTable]);
  assert.ok(
    accountAddresses(operation.instructions[0].accounts).includes(admin.address),
    "expected the current protocol admin signer"
  );
});

test("protocol admin transfer builds set-pending and accept instructions", async () => {
  const ctx = createFakeScriptContext();
  const admin = await makeSigner();
  const pendingAdmin = await makeSigner();

  const setPending = await buildSetPendingProtocolAdminOperation(ctx, {
    admin,
    pendingAdmin: pendingAdmin.address,
  });
  assertBuiltOperationShape(setPending, {
    label: "protocol:set-pending-admin",
  });
  assert.equal(setPending.instructions.length, 1);
  assert.ok(
    accountAddresses(setPending.instructions[0].accounts).includes(admin.address),
    "expected the current protocol admin signer"
  );

  const accept = await buildAcceptProtocolAdminOperation(ctx, { pendingAdmin });
  assertBuiltOperationShape(accept, { label: "protocol:accept-admin" });
  assert.equal(accept.instructions.length, 1);
  assert.ok(
    accountAddresses(accept.instructions[0].accounts).includes(
      pendingAdmin.address
    ),
    "expected the pending protocol admin signer"
  );
});

test("vault adaptor policy update requires a 0 or 1 flag", async () => {
  const ctx = createFakeScriptContext();
  const admin = await makeSigner();
  const vault = await makeAddress();

  const operation = await buildUpdateVaultAdaptorPolicyOperation(ctx, {
    admin,
    vault,
    allowAnyAdaptor: 1,
  });

  assertBuiltOperationShape(operation, {
    label: "vault:update-adaptor-policy",
  });
  assert.equal(operation.instructions.length, 1);
  const accounts = accountAddresses(operation.instructions[0].accounts);
  assert.ok(accounts.includes(admin.address), "expected protocol admin signer");
  assert.ok(accounts.includes(vault), "expected target vault account");

  await assert.rejects(
    () =>
      buildUpdateVaultAdaptorPolicyOperation(ctx, {
        admin,
        vault,
        allowAnyAdaptor: 2,
      }),
    /allowAnyAdaptor must be 0 or 1/
  );
});

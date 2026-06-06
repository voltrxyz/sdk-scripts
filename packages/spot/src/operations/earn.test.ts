import { test } from "node:test";
import assert from "node:assert/strict";
import { address, generateKeyPairSigner } from "@solana/kit";
import {
  assertBuiltOperationShape,
  createFakeScriptContext,
} from "@voltr/scripts-core/testing";
import { ADAPTOR_PROGRAM_ID } from "../constants.js";
import { findJupiterLendingPda } from "../pda.js";
import { buildSpotEarnInitDirectWithdrawOperation } from "./earn.js";

const USDC = address("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
const VAULT = address("11111111111111111111111111111111");
// Per-deployment direct-withdraw discriminator (placeholder bytes for the test).
const DIRECT_WITHDRAW_DISCRIMINATOR = [232, 204, 244, 40, 201, 192, 7, 194];

test("spot:earn:init-direct-withdraw targets the derived Jupiter lending strategy", async () => {
  const ctx = createFakeScriptContext();
  const admin = await generateKeyPairSigner();
  const lut = address("AddressLookupTab1e1111111111111111111111111");

  const operation = await buildSpotEarnInitDirectWithdrawOperation(ctx, {
    admin,
    vault: VAULT,
    assetMint: USDC,
    instructionDiscriminator: DIRECT_WITHDRAW_DISCRIMINATOR,
    lookupTableAddresses: [lut],
  });

  assertBuiltOperationShape(operation, {
    label: "spot:earn:init-direct-withdraw",
  });
  assert.equal(operation.instructions.length, 1);
  assert.deepEqual(operation.lookupTableAddresses, [lut]);

  // The wrapper must derive the strategy (Jupiter `lending` PDA) and bind the
  // Spot adaptor program — both should appear in the instruction's accounts.
  const lending = await findJupiterLendingPda({ assetMint: USDC });
  const accounts = (operation.instructions[0].accounts ?? []).map(
    (account) => account.address
  );
  assert.ok(accounts.includes(lending), "expected the derived lending strategy");
  assert.ok(
    accounts.includes(ADAPTOR_PROGRAM_ID),
    "expected the Spot adaptor program"
  );
});

test("findJupiterLendingPda is deterministic and accepts a precomputed fTokenMint", async () => {
  const a = await findJupiterLendingPda({ assetMint: USDC });
  const b = await findJupiterLendingPda({ assetMint: USDC });
  assert.equal(a, b);
});

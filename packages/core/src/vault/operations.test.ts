import { test } from "node:test";
import assert from "node:assert/strict";
import {
  generateKeyPairSigner,
  type Address,
  type KeyPairSigner,
} from "@solana/kit";
import { SYSTEM_PROGRAM_ADDRESS } from "@solana-program/system";
import {
  ASSOCIATED_TOKEN_PROGRAM_ADDRESS,
  TOKEN_PROGRAM_ADDRESS,
} from "@solana-program/token";
import { findVaultLpMintPda } from "@voltr/vault-sdk";
import { assertBuiltOperationShape } from "../testing.js";
import type { ScriptContext } from "../types.js";
import { NATIVE_MINT } from "./constants.js";
import {
  buildAcceptVaultAdminOperation,
  buildHarvestFeeOperation,
  buildInitVaultOperation,
  buildInitVaultWithMetadataOperation,
  buildUpdateVaultConfigOperation,
  type InitVaultArgs,
} from "./admin.js";
import { VaultConfigField } from "./config.js";
import {
  buildCancelRequestWithdrawVaultOperation,
  buildDepositVaultOperation,
  buildInstantWithdrawVaultOperation,
  buildRequestWithdrawVaultOperation,
  buildWithdrawVaultOperation,
} from "./operations.js";

const USDC_MINT =
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" as Address;

// setupTokenAccount only consults getAccountInfo to decide whether to emit a
// create-ATA instruction. A stub that reports "account exists" keeps the tests
// offline and isolates the wSOL wrap/unwrap behavior we care about.
function makeCtx(accountExists: boolean): ScriptContext {
  const value = accountExists ? ({ lamports: 1n } as unknown) : null;
  return {
    profile: {
      name: "test",
      cluster: "devnet",
      vault: {
        assetMintAddress: USDC_MINT,
        assetTokenProgram: TOKEN_PROGRAM_ADDRESS,
      },
    },
    rpcUrl: "http://localhost:9999",
    rpc: {
      getAccountInfo: () => ({ send: async () => ({ value }) }),
    } as unknown as ScriptContext["rpc"],
  };
}

async function makeSigner(): Promise<KeyPairSigner> {
  return generateKeyPairSigner();
}

async function makeVault(): Promise<Address> {
  return (await generateKeyPairSigner()).address;
}

test("deposit wraps native SOL: create wSOL ATA, transfer, sync, then close", async () => {
  const ctx = makeCtx(true); // LP ATA already exists -> no LP create
  const user = await makeSigner();
  const vault = await makeVault();

  const op = await buildDepositVaultOperation(ctx, {
    user,
    vault,
    assetMint: NATIVE_MINT,
    assetTokenProgram: TOKEN_PROGRAM_ADDRESS,
    amount: 1_000_000n,
  });

  assertBuiltOperationShape(op, { label: "vault:deposit", minInstructions: 5 });
  // createATA(wSOL) + transferSol + syncNative + deposit + closeAccount
  assert.equal(op.instructions.length, 5);
  const programs = op.instructions.map((ix) => ix.programAddress);
  assert.equal(op.instructions[0].programAddress, ASSOCIATED_TOKEN_PROGRAM_ADDRESS);
  assert.ok(
    programs.includes(SYSTEM_PROGRAM_ADDRESS),
    "expected a System transfer to fund the wSOL ATA"
  );
  assert.equal(
    op.instructions.at(-1)?.programAddress,
    TOKEN_PROGRAM_ADDRESS,
    "expected the wSOL ATA to be closed (unwrapped) last"
  );
});

test("deposit of a non-native mint does not wrap SOL", async () => {
  const ctx = makeCtx(true); // LP ATA exists -> no create
  const user = await makeSigner();
  const vault = await makeVault();

  const op = await buildDepositVaultOperation(ctx, {
    user,
    vault,
    assetMint: USDC_MINT,
    assetTokenProgram: TOKEN_PROGRAM_ADDRESS,
    amount: 1_000_000n,
  });

  assertBuiltOperationShape(op, { label: "vault:deposit" });
  // Just the deposit instruction; no wrap, sync, or close.
  assert.equal(op.instructions.length, 1);
  const programs = op.instructions.map((ix) => ix.programAddress);
  assert.ok(!programs.includes(SYSTEM_PROGRAM_ADDRESS));
});

test("deposit creates the LP token account when it is missing", async () => {
  const ctx = makeCtx(false); // LP ATA missing -> setupTokenAccount adds create
  const user = await makeSigner();
  const vault = await makeVault();

  const op = await buildDepositVaultOperation(ctx, {
    user,
    vault,
    assetMint: USDC_MINT,
    assetTokenProgram: TOKEN_PROGRAM_ADDRESS,
    amount: 1_000_000n,
  });

  assertBuiltOperationShape(op, { label: "vault:deposit", minInstructions: 2 });
  // create LP ATA + deposit
  assert.equal(op.instructions.length, 2);
});

test("withdraw closes the wSOL ATA only for native SOL", async () => {
  const ctx = makeCtx(true);
  const user = await makeSigner();
  const vault = await makeVault();

  const native = await buildWithdrawVaultOperation(ctx, {
    user,
    vault,
    assetMint: NATIVE_MINT,
    assetTokenProgram: TOKEN_PROGRAM_ADDRESS,
  });
  assertBuiltOperationShape(native, {
    label: "vault:withdraw",
    minInstructions: 3,
  });
  // createATA(asset) + withdraw + closeAccount
  assert.equal(native.instructions.length, 3);
  assert.equal(native.instructions.at(-1)?.programAddress, TOKEN_PROGRAM_ADDRESS);

  const spl = await buildWithdrawVaultOperation(ctx, {
    user,
    vault,
    assetMint: USDC_MINT,
    assetTokenProgram: TOKEN_PROGRAM_ADDRESS,
  });
  assertBuiltOperationShape(spl, { label: "vault:withdraw", minInstructions: 2 });
  // createATA(asset) + withdraw, no close
  assert.equal(spl.instructions.length, 2);
});

test("instant-withdraw closes the wSOL ATA only for native SOL", async () => {
  const ctx = makeCtx(true); // user asset ATA exists -> no create
  const user = await makeSigner();
  const vault = await makeVault();

  const native = await buildInstantWithdrawVaultOperation(ctx, {
    user,
    vault,
    assetMint: NATIVE_MINT,
    assetTokenProgram: TOKEN_PROGRAM_ADDRESS,
    amount: 1n,
    isAmountInLp: false,
    isWithdrawAll: false,
  });
  assertBuiltOperationShape(native, {
    label: "vault:instant-withdraw",
    minInstructions: 2,
  });
  // instantWithdraw + closeAccount
  assert.equal(native.instructions.length, 2);
  assert.equal(native.instructions.at(-1)?.programAddress, TOKEN_PROGRAM_ADDRESS);

  const spl = await buildInstantWithdrawVaultOperation(ctx, {
    user,
    vault,
    assetMint: USDC_MINT,
    assetTokenProgram: TOKEN_PROGRAM_ADDRESS,
    amount: 1n,
    isAmountInLp: false,
    isWithdrawAll: false,
  });
  assertBuiltOperationShape(spl, { label: "vault:instant-withdraw" });
  // just instantWithdraw, no close
  assert.equal(spl.instructions.length, 1);
});

test("request-withdraw escrows LP into the receipt ATA when missing", async () => {
  const user = await makeSigner();
  const vault = await makeVault();
  const args = {
    user,
    vault,
    amount: 1_000_000n,
    isAmountInLp: false,
    isWithdrawAll: false,
  };

  const missing = await buildRequestWithdrawVaultOperation(makeCtx(false), args);
  assertBuiltOperationShape(missing, {
    label: "vault:request-withdraw",
    minInstructions: 2,
  });
  // create receipt LP ATA + requestWithdraw
  assert.equal(missing.instructions.length, 2);

  const existing = await buildRequestWithdrawVaultOperation(makeCtx(true), args);
  assertBuiltOperationShape(existing, { label: "vault:request-withdraw" });
  // receipt LP ATA exists -> just requestWithdraw
  assert.equal(existing.instructions.length, 1);
});

test("harvest-fee sets up LP accounts for admin, manager, and protocol admin", async () => {
  const admin = await makeSigner();
  const manager = await makeVault();
  const vault = await makeVault();
  const args = { admin, manager, vault };

  const missing = await buildHarvestFeeOperation(makeCtx(false), args);
  assertBuiltOperationShape(missing, {
    label: "vault:harvest-fee",
    minInstructions: 4,
  });
  // three create-ATA instructions (admin, manager, protocol admin) + harvest
  assert.equal(missing.instructions.length, 4);

  const existing = await buildHarvestFeeOperation(makeCtx(true), args);
  assertBuiltOperationShape(existing, { label: "vault:harvest-fee" });
  // all LP accounts exist -> just harvest
  assert.equal(existing.instructions.length, 1);
});

test("cancel-request-withdraw and accept-admin build a single instruction", async () => {
  const ctx = makeCtx(true);
  const user = await makeSigner();
  const vault = await makeVault();

  const cancel = await buildCancelRequestWithdrawVaultOperation(ctx, {
    user,
    vault,
  });
  assertBuiltOperationShape(cancel, { label: "vault:cancel-request-withdraw" });
  assert.equal(cancel.instructions.length, 1);

  const accept = await buildAcceptVaultAdminOperation(ctx, {
    pendingAdmin: user,
    vault,
  });
  assertBuiltOperationShape(accept, { label: "vault:accept-admin" });
  assert.equal(accept.instructions.length, 1);
});

test("init builders thread an existing lookup table through, like the others", async () => {
  const admin = await makeSigner();
  const vault = await makeSigner(); // the freshly generated vault keypair
  const manager = await makeVault();
  const lut = await makeVault();
  const config: InitVaultArgs["config"] = {
    maxCap: 0n,
    startAtTs: 0n,
    managerPerformanceFee: 0,
    adminPerformanceFee: 0,
    managerManagementFee: 0,
    adminManagementFee: 0,
    lockedProfitDegradationDuration: 0n,
    redemptionFee: 0,
    issuanceFee: 0,
    withdrawalWaitingPeriod: 0n,
  };
  const base: InitVaultArgs = {
    admin,
    manager,
    vault,
    assetMint: USDC_MINT,
    assetTokenProgram: TOKEN_PROGRAM_ADDRESS,
    config,
    name: "n",
    description: "d",
    lookupTableAddresses: [lut],
  };

  const init = await buildInitVaultOperation(makeCtx(true), base);
  assertBuiltOperationShape(init, { label: "vault:init" });
  assert.equal(init.instructions.length, 1);
  assert.deepEqual(init.lookupTableAddresses, [lut]);

  const withMeta = await buildInitVaultWithMetadataOperation(makeCtx(true), {
    ...base,
    lpTokenMetadata: { name: "LP", symbol: "LP", uri: "" },
  });
  assertBuiltOperationShape(withMeta, {
    label: "vault:init-with-metadata",
    minInstructions: 2,
  });
  assert.equal(withMeta.instructions.length, 2);
  assert.deepEqual(withMeta.lookupTableAddresses, [lut]);
});

test("update-config appends the LP mint only for management-fee fields", async () => {
  const ctx = makeCtx(true);
  const admin = await makeSigner();
  const vault = await makeVault();
  const [lpMint] = await findVaultLpMintPda({ vault });

  const mgmt = await buildUpdateVaultConfigOperation(ctx, {
    admin,
    vault,
    field: VaultConfigField.ManagerManagementFee,
    value: 100,
  });
  assertBuiltOperationShape(mgmt, { label: "vault:update-config" });
  const mgmtAccounts = mgmt.instructions[0].accounts ?? [];
  assert.equal(mgmtAccounts.at(-1)?.address, lpMint);

  const cap = await buildUpdateVaultConfigOperation(ctx, {
    admin,
    vault,
    field: VaultConfigField.MaxCap,
    value: 200n,
  });
  assertBuiltOperationShape(cap, { label: "vault:update-config" });
  const capAccounts = cap.instructions[0].accounts ?? [];
  assert.notEqual(capAccounts.at(-1)?.address, lpMint);
  // The management-fee variant carries exactly one extra (LP mint) account.
  assert.equal(capAccounts.length + 1, mgmtAccounts.length);
});

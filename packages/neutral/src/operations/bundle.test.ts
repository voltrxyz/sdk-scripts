import assert from "node:assert/strict";
import { test } from "node:test";
import {
  address,
  createNoopSigner,
  AccountRole,
  type Address,
  type ReadonlyUint8Array,
} from "@solana/kit";
import {
  getTokenEncoder,
  TOKEN_PROGRAM_ADDRESS,
  AccountState,
} from "@solana-program/token";
import {
  getDepositStrategyInstructionDataDecoder,
  getWithdrawStrategyInstructionDataDecoder,
  VOLTR_VAULT_PROGRAM_ADDRESS,
} from "@voltr/vault-sdk";
import {
  createFakeRpc,
  createFakeScriptContext,
} from "@voltr/scripts-core/testing";
import { getBundleEncoder } from "../generated/accounts/bundle.js";
import { getUserBundleAccountEncoder } from "../generated/accounts/userBundleAccount.js";
import { getStrategyInitReceiptEncoder } from "../generated-vault/accounts/strategyInitReceipt.js";
import { bundleFixture, userFixture } from "./fixtures.js";
import {
  deriveNeutralBundleAccounts,
  NEUTRAL_ADAPTOR_PROGRAM_ID,
  NTBUNDLE_PROGRAM_ID,
  U64_MAX,
  queryNeutralBundleStatus,
} from "../index.js";
import {
  buildNeutralBundleInitOperation,
  buildNeutralBundleDepositOperation,
  buildNeutralBundleRefreshOperation,
  buildNeutralBundleRequestWithdrawOperation,
  buildNeutralBundleClaimOperation,
  buildNeutralBundleRegisterDepositorOperation,
} from "./bundle.js";

const vault = address("So11111111111111111111111111111111111111112");
const bundle = address("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
const manager = createNoopSigner(address("11111111111111111111111111111111"));
const treasury = address("SysvarRent111111111111111111111111111111111");
const args = {
  vault,
  bundle,
  assetMint: bundle,
  assetTokenProgram: TOKEN_PROGRAM_ADDRESS,
  manager,
};

test("Kit PDAs match addresses independently derived with the adaptor test suite's web3.js helpers", async () => {
  assert.deepEqual(await deriveNeutralBundleAccounts(vault, bundle, args.assetMint), {
    vaultStrategyAuth: "57QnXkAg5EEjkHYuQGcF16j12a5ktQRYgWYeXuNieoBc",
    strategyInitReceipt: "GNskFoh2Rynua6HCG8p6C9SDupBPe63aRj6h1NXvS1Hj",
    userBundleAccount: "HWY8HaJEXbHM9SprQumW8Efov5U3LHchSmrPagM86CLY",
    oracleData: "94jNiLM37mF6tEHJQ33RFJKwyiWDTSLmj3Y6hxWCF6ds",
    bundleTempData: "7mNpE8KY9M885bkxdmowe8BHuPgKZs43G2yWtb2EiieY",
    pendingBundleAssetAuthority: "6neUWv2tgAdaFGAovtHDTgHpA98h35f5CCU3v29f7izb",
    vaultStrategyAssetAta: "3qLPSvHPi3LBysAaEadbnm5nVGJeyuzyPPJimxSSybg5",
    pendingDepositTokenAccount: "2f9EGQGGq6JcM3Tf3Wy7iQzLPxqhMbruLdVpBpCpXDpF",
  });
});

async function fixture(
  options: {
    initialized?: boolean;
    permissioned?: boolean;
    version?: number;
    pendingShares?: bigint;
    pendingDeposit?: bigint;
    tokens?: bigint;
    cached?: bigint;
  } = {}
) {
  const accounts = await deriveNeutralBundleAccounts(
    vault,
    bundle,
    args.assetMint
  );
  const data = new Map<
    Address,
    { owner: Address; data: [string, "base64"]; executable: boolean }
  >();
  const put = (account: Address, owner: Address, bytes: ReadonlyUint8Array) =>
    data.set(account, {
      owner,
      data: [Buffer.from(bytes).toString("base64"), "base64"],
      executable: false,
    });
  put(
    bundle,
    NTBUNDLE_PROGRAM_ID,
    getBundleEncoder().encode(
      bundleFixture({
        manager: manager.address,
        treasuryAccount: treasury,
        assetAddress: bundle,
        permissionned: options.permissioned ?? false,
        allocatedReceivers: [vault, treasury],
      })
    )
  );
  if (options.initialized !== false) {
    put(
      accounts.userBundleAccount,
      NTBUNDLE_PROGRAM_ID,
      getUserBundleAccountEncoder().encode(
        userFixture({
          owner: accounts.vaultStrategyAuth,
          shares: 10_000_000_000n,
          pendingShares: options.pendingShares ?? 0n,
          pendingDeposit: options.pendingDeposit ?? 0n,
          withdrawalAvailableTimestamp: 1_900_000_123n,
        })
      )
    );
    put(
      accounts.strategyInitReceipt,
      VOLTR_VAULT_PROGRAM_ADDRESS,
      getStrategyInitReceiptEncoder().encode({
        vault,
        strategy: bundle,
        adaptorProgram: NEUTRAL_ADAPTOR_PROGRAM_ID,
        version: options.version ?? 2,
        positionValue: 9_800_000_000n,
        lastUpdatedTs: 1_900_000_000n,
        bump: 1,
        vaultStrategyAuthBump: 2,
        padding0: new Uint8Array(5),
        lastAccountedStrategyAtaAmount: options.cached ?? 0n,
        reserved: new Uint8Array(48),
      })
    );
  }
  put(
    accounts.vaultStrategyAssetAta,
    TOKEN_PROGRAM_ADDRESS,
    getTokenEncoder().encode({
      mint: bundle,
      owner: accounts.vaultStrategyAuth,
      amount: options.tokens ?? 0n,
      delegate: null,
      state: AccountState.Initialized,
      isNative: null,
      delegatedAmount: 0n,
      closeAuthority: null,
    })
  );
  const context = createFakeScriptContext({
    rpc: createFakeRpc({
      getAccountInfo: (account) => ({ value: data.get(account) ?? null }),
    }),
  });
  return { context, accounts, data, put };
}

test("init creates the settlement ATA before the vault CPI and supplies only the three required accounts", async () => {
  const { context, accounts } = await fixture({ initialized: false });
  const result = await buildNeutralBundleInitOperation(context, args);
  assert.equal(result.label, "neutral:bundle:init");
  assert.equal(result.instructions.length, 2);
  assert.equal(
    result.instructions[1].programAddress,
    VOLTR_VAULT_PROGRAM_ADDRESS
  );
  assert.deepEqual(
    result.instructions[1].accounts
      ?.slice(-3)
      .map((account) => [account.address, account.role]),
    [
      [bundle, AccountRole.WRITABLE],
      [accounts.userBundleAccount, AccountRole.WRITABLE],
      [NTBUNDLE_PROGRAM_ID, AccountRole.READONLY],
    ]
  );
  assert.ok(
    result.instructions[0].accounts?.some(
      (account) => account.address === accounts.vaultStrategyAssetAta
    )
  );
});

test("deposit uses the decoded treasury after a variable-length receivers vector and preserves exact bigint amount", async () => {
  const { context, accounts } = await fixture();
  const amount = 9_007_199_254_740_993n;
  const result = await buildNeutralBundleDepositOperation(context, {
    ...args,
    amount,
  });
  const instruction = result.instructions[0];
  assert.equal(
    getDepositStrategyInstructionDataDecoder().decode(instruction.data!).amount,
    amount
  );
  assert.deepEqual(
    instruction.accounts
      ?.slice(-9)
      .map((account) => [account.address, account.role]),
    [
      bundle,
      accounts.userBundleAccount,
      accounts.oracleData,
      accounts.bundleTempData,
      accounts.pendingDepositTokenAccount,
      accounts.pendingBundleAssetAuthority,
      treasury,
    ]
      .map((account) => [account, AccountRole.WRITABLE])
      .concat([
        [NTBUNDLE_PROGRAM_ID, AccountRole.READONLY],
        [manager.address, AccountRole.READONLY],
      ])
  );
  for (const amount of [0n, -1n, U64_MAX + 1n])
    await assert.rejects(
      buildNeutralBundleDepositOperation(context, { ...args, amount }),
      /amount/
    );
});

test("refresh is a zero deposit; request-all has the custom discriminator; claim uses the default withdraw and read-only accounts", async () => {
  const { context, accounts } = await fixture({ tokens: 123n });
  const refresh = await buildNeutralBundleRefreshOperation(context, args);
  assert.equal(
    getDepositStrategyInstructionDataDecoder().decode(
      refresh.instructions[0].data!
    ).amount,
    0n
  );
  const request = await buildNeutralBundleRequestWithdrawOperation(context, {
    ...args,
    amount: U64_MAX,
  });
  const decoded = getWithdrawStrategyInstructionDataDecoder().decode(
    request.instructions[0].data!
  );
  assert.equal(decoded.amount, U64_MAX);
  assert.deepEqual(decoded.instructionDiscriminator, {
    __option: "Some",
    value: new Uint8Array([137, 95, 187, 96, 250, 138, 31, 182]),
  });
  assert.deepEqual(
    request.instructions[0].accounts
      ?.slice(-7)
      .map((account) => [account.address, account.role]),
    [
      [bundle, AccountRole.WRITABLE],
      [accounts.userBundleAccount, AccountRole.WRITABLE],
      [accounts.oracleData, AccountRole.WRITABLE],
      [accounts.bundleTempData, AccountRole.WRITABLE],
      [NTBUNDLE_PROGRAM_ID, AccountRole.READONLY],
      [manager.address, AccountRole.READONLY],
      [treasury, AccountRole.READONLY],
    ]
  );
  const claim = await buildNeutralBundleClaimOperation(context, args);
  assert.deepEqual(
    getWithdrawStrategyInstructionDataDecoder().decode(
      claim.instructions[0].data!
    ).instructionDiscriminator,
    { __option: "None" }
  );
  assert.deepEqual(
    claim.instructions[0].accounts
      ?.slice(-3)
      .map((account) => [account.address, account.role]),
    [
      [bundle, AccountRole.READONLY],
      [accounts.userBundleAccount, AccountRole.READONLY],
      [accounts.oracleData, AccountRole.READONLY],
    ]
  );
});

test("status distinguishes pending requests from available tokens and reports cached accounting separately", async () => {
  const pending = await fixture({ pendingShares: 800n });
  const status = await queryNeutralBundleStatus(pending.context, args);
  assert.equal(status.pendingShares, "800");
  assert.equal(status.claimable, false);
  assert.equal(status.withdrawalAvailableTimestamp, "1900000123");
  await assert.rejects(
    buildNeutralBundleClaimOperation(pending.context, args),
    /No tokens/
  );
  const settled = await fixture({ tokens: 792n });
  const settledStatus = await queryNeutralBundleStatus(settled.context, args);
  assert.equal(settledStatus.pendingShares, "0");
  assert.equal(settledStatus.strategyAtaAmount, "792");
  assert.equal(settledStatus.lastAccountedStrategyAtaAmount, "0");
  assert.equal(settledStatus.claimable, true);
  const refreshed = await fixture({ tokens: 792n, cached: 792n });
  assert.equal(
    (await queryNeutralBundleStatus(refreshed.context, args))
      .lastAccountedStrategyAtaAmount,
    "792"
  );
});

test("permissioned initialization requires registration by the Neutral manager", async () => {
  const { context, accounts } = await fixture({
    permissioned: true,
    initialized: false,
  });
  await assert.rejects(
    buildNeutralBundleInitOperation(context, args),
    /register-depositor/
  );
  await assert.rejects(
    buildNeutralBundleRegisterDepositorOperation(context, {
      ...args,
      bundleManager: createNoopSigner(vault),
    }),
    /Neutral bundle manager/
  );
  const registration = await buildNeutralBundleRegisterDepositorOperation(
    context,
    { ...args, bundleManager: manager }
  );
  assert.equal(
    registration.instructions[0].programAddress,
    NTBUNDLE_PROGRAM_ID
  );
  assert.equal(
    registration.instructions[0].accounts?.[1].address,
    accounts.vaultStrategyAuth
  );
  const registered = await fixture({ permissioned: true });
  await buildNeutralBundleInitOperation(registered.context, args);
});

test("rejects incompatible assets, uninitialized strategies, pending requests and legacy accounting", async () => {
  const { context } = await fixture();
  await assert.rejects(
    buildNeutralBundleRefreshOperation(context, {
      ...args,
      assetTokenProgram: manager.address,
    }),
    /Classic Token/
  );
  await assert.rejects(
    buildNeutralBundleRefreshOperation(context, { ...args, assetMint: vault }),
    /asset mint/
  );
  const absent = await fixture({ initialized: false });
  await assert.rejects(
    buildNeutralBundleDepositOperation(absent.context, { ...args, amount: 1n }),
    /Initialize/
  );
  for (const options of [{ pendingShares: 1n }, { pendingDeposit: 1n }]) {
    const pending = await fixture(options);
    await assert.rejects(
      buildNeutralBundleRequestWithdrawOperation(pending.context, {
        ...args,
        amount: 1n,
      }),
      /pending/
    );
  }
  const legacy = await fixture({ version: 1, tokens: 100n });
  await assert.rejects(
    buildNeutralBundleClaimOperation(legacy.context, args),
    /version-2/
  );
  assert.equal(
    (await queryNeutralBundleStatus(legacy.context, args)).accountingReady,
    false
  );
});

test("rejects foreign owners, wrong discriminators, truncated state and mismatched depositor ownership", async () => {
  const { context, data, put, accounts } = await fixture();
  const original = data.get(bundle)!;
  data.set(bundle, { ...original, owner: vault });
  await assert.rejects(buildNeutralBundleInitOperation(context, args), /owner/);
  put(bundle, NTBUNDLE_PROGRAM_ID, new Uint8Array(8));
  await assert.rejects(
    buildNeutralBundleInitOperation(context, args),
    /discriminator/
  );
  put(
    bundle,
    NTBUNDLE_PROGRAM_ID,
    Buffer.from(original.data[0], "base64").subarray(0, 10)
  );
  await assert.rejects(buildNeutralBundleInitOperation(context, args), /data/);
  data.set(bundle, original);
  put(
    accounts.userBundleAccount,
    NTBUNDLE_PROGRAM_ID,
    getUserBundleAccountEncoder().encode(userFixture({ owner: vault }))
  );
  await assert.rejects(
    queryNeutralBundleStatus(context, args),
    /depositor owner/
  );
});

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  generateKeyPairSigner,
  getBase64Decoder,
  type Address,
  type ReadonlyUint8Array,
} from "@solana/kit";
import {
  findProtocolPda,
  getProtocolEncoder,
  getVaultEncoder,
  VOLTR_VAULT_PROGRAM_ADDRESS,
  type ProtocolArgs,
  type VaultArgs,
} from "@voltr/vault-sdk";
import type { SolanaRpc } from "../types.js";
import { createFakeScriptContext } from "../testing.js";
import { queryProtocolFeeVaults } from "./queries.js";

const base64Decoder = getBase64Decoder();

function fixedBytes(size: number): Uint8Array {
  return new Uint8Array(size);
}

function fixedText(value: string, size: number): Uint8Array {
  const bytes = fixedBytes(size);
  bytes.set(new TextEncoder().encode(value));
  return bytes;
}

interface VaultFixtureArgs {
  name: string;
  assetMint: Address;
  idleAta: Address;
  lpMint: Address;
  pendingAdmin: Address;
  manager: Address;
  admin: Address;
  totalValue: bigint;
  disabledOperations: number;
  protocolPerformanceFee: number;
  protocolManagementFee: number;
  adminPerformanceFee: number;
  adminManagementFee: number;
  managerPerformanceFee: number;
  managerManagementFee: number;
  accruedLpAdminFees: bigint;
  accruedLpManagerFees: bigint;
  accruedLpProtocolFees: bigint;
  lastManagementFeeUpdateTs: bigint;
  version: number;
}

function vaultFixture(args: VaultFixtureArgs): VaultArgs {
  return {
    name: fixedText(args.name, 32),
    description: fixedText(`${args.name} description`, 64),
    asset: {
      mint: args.assetMint,
      idleAta: args.idleAta,
      totalValue: args.totalValue,
      idleAtaAuthBump: 3,
      reserved: fixedBytes(95),
    },
    lp: {
      mint: args.lpMint,
      mintBump: 4,
      mintAuthBump: 5,
      reserved: fixedBytes(30),
    },
    pendingAdmin: args.pendingAdmin,
    manager: args.manager,
    admin: args.admin,
    vaultConfiguration: {
      maxCap: 9_000n,
      startAtTs: 10n,
      lockedProfitDegradationDuration: 11n,
      withdrawalWaitingPeriod: 12n,
      disabledOperations: args.disabledOperations,
      reserved: fixedBytes(46),
    },
    feeConfiguration: {
      managerPerformanceFee: args.managerPerformanceFee,
      adminPerformanceFee: args.adminPerformanceFee,
      managerManagementFee: args.managerManagementFee,
      adminManagementFee: args.adminManagementFee,
      redemptionFee: 7,
      issuanceFee: 8,
      protocolPerformanceFee: args.protocolPerformanceFee,
      protocolManagementFee: args.protocolManagementFee,
      reserved: fixedBytes(32),
    },
    feeUpdate: {
      lastPerformanceFeeUpdateTs: 99n,
      lastManagementFeeUpdateTs: args.lastManagementFeeUpdateTs,
    },
    feeState: {
      accumulatedLpManagerFees: args.accruedLpManagerFees,
      accumulatedLpAdminFees: args.accruedLpAdminFees,
      accumulatedLpProtocolFees: args.accruedLpProtocolFees,
      reserved: fixedBytes(16),
    },
    deadWeight: 13n,
    highWaterMark: {
      highestAssetPerLpDecimalBits: 14n,
      lastUpdatedTs: 15n,
      reserved: fixedBytes(8),
    },
    lastUpdatedTs: 16n,
    version: args.version,
    allowAnyAdaptor: 0,
    padding0: fixedBytes(6),
    lockedProfitState: {
      lastUpdatedLockedProfit: 17n,
      lastReport: 18n,
    },
    reserved: fixedBytes(240),
  };
}

function rpcAccount(data: ReadonlyUint8Array) {
  return {
    data: [base64Decoder.decode(data), "base64"] as const,
    executable: false,
    lamports: 1n,
    owner: VOLTR_VAULT_PROGRAM_ADDRESS,
    space: BigInt(data.length),
  };
}

test("queryProtocolFeeVaults decodes, filters, maps, and sorts live account data", async () => {
  const addresses = await Promise.all(
    Array.from({ length: 15 }, async () =>
      (await generateKeyPairSigner()).address
    )
  );
  const [
    protocolAdmin,
    pendingProtocolAdmin,
    protocolTreasury,
    sharedVaultAdmin,
    performanceManager,
    managementManager,
    assetMint,
    idleAta,
    performanceLpMint,
    managementLpMint,
    noFeeLpMint,
    performanceVault,
    managementVault,
    noFeeVault,
    pendingVaultAdmin,
  ] = addresses;
  const [protocol, protocolBump] = await findProtocolPda();

  const protocolData = getProtocolEncoder().encode({
    admin: protocolAdmin,
    operationalState: 1 << 8,
    padding1: fixedBytes(2),
    bump: protocolBump,
    padding0: fixedBytes(1),
    pendingAdmin: pendingProtocolAdmin,
    treasury: protocolTreasury,
  } satisfies ProtocolArgs);

  const encodedVaults = [
    {
      pubkey: managementVault,
      data: getVaultEncoder().encode(
        vaultFixture({
          name: "Zulu",
          assetMint,
          idleAta,
          lpMint: managementLpMint,
          pendingAdmin: pendingVaultAdmin,
          manager: managementManager,
          admin: sharedVaultAdmin,
          totalValue: 222n,
          disabledOperations: 0,
          protocolPerformanceFee: 0,
          protocolManagementFee: 15,
          adminPerformanceFee: 16,
          adminManagementFee: 17,
          managerPerformanceFee: 18,
          managerManagementFee: 19,
          accruedLpAdminFees: 211n,
          accruedLpManagerFees: 212n,
          accruedLpProtocolFees: 213n,
          lastManagementFeeUpdateTs: 214n,
          version: 3,
        })
      ),
    },
    {
      pubkey: noFeeVault,
      data: getVaultEncoder().encode(
        vaultFixture({
          name: "Ignored",
          assetMint,
          idleAta,
          lpMint: noFeeLpMint,
          pendingAdmin: pendingVaultAdmin,
          manager: managementManager,
          admin: sharedVaultAdmin,
          totalValue: 333n,
          disabledOperations: 0,
          protocolPerformanceFee: 0,
          protocolManagementFee: 0,
          adminPerformanceFee: 26,
          adminManagementFee: 27,
          managerPerformanceFee: 28,
          managerManagementFee: 29,
          accruedLpAdminFees: 311n,
          accruedLpManagerFees: 312n,
          accruedLpProtocolFees: 313n,
          lastManagementFeeUpdateTs: 314n,
          version: 4,
        })
      ),
    },
    {
      pubkey: performanceVault,
      data: getVaultEncoder().encode(
        vaultFixture({
          name: "Alpha",
          assetMint,
          idleAta,
          lpMint: performanceLpMint,
          pendingAdmin: pendingVaultAdmin,
          manager: performanceManager,
          admin: sharedVaultAdmin,
          totalValue: 111n,
          disabledOperations: 1 << 3,
          protocolPerformanceFee: 25,
          protocolManagementFee: 0,
          adminPerformanceFee: 35,
          adminManagementFee: 45,
          managerPerformanceFee: 55,
          managerManagementFee: 65,
          accruedLpAdminFees: 101n,
          accruedLpManagerFees: 202n,
          accruedLpProtocolFees: 303n,
          lastManagementFeeUpdateTs: 404n,
          version: 2,
        })
      ),
    },
  ];

  const rpc = {
    getAccountInfo(account: Address) {
      return {
        send: async () => ({
          value:
            String(account) === String(protocol)
              ? rpcAccount(protocolData)
              : null,
        }),
      };
    },
    getProgramAccounts() {
      return {
        send: async () =>
          encodedVaults.map(({ pubkey, data }) => ({
            pubkey,
            account: rpcAccount(data),
          })),
      };
    },
  } as unknown as SolanaRpc;
  const ctx = createFakeScriptContext({ rpc });

  const snapshot = await queryProtocolFeeVaults(ctx);

  assert.deepEqual(snapshot.protocol, {
    protocol,
    admin: protocolAdmin,
    pendingAdmin: pendingProtocolAdmin,
    treasury: protocolTreasury,
    operationalState: 1 << 8,
    harvestEnabled: true,
  });
  assert.equal(snapshot.totalVaults, 3);
  assert.deepEqual(
    snapshot.vaults.map(({ name, vault }) => ({ name, vault })),
    [
      { name: "Alpha", vault: performanceVault },
      { name: "Zulu", vault: managementVault },
    ]
  );
  assert.deepEqual(snapshot.vaults[0], {
    vault: performanceVault,
    name: "Alpha",
    version: 2,
    assetMint,
    lpMint: performanceLpMint,
    totalValue: "111",
    admin: sharedVaultAdmin,
    manager: performanceManager,
    protocolPerformanceFeeBps: 25,
    protocolManagementFeeBps: 0,
    adminPerformanceFeeBps: 35,
    adminManagementFeeBps: 45,
    managerPerformanceFeeBps: 55,
    managerManagementFeeBps: 65,
    accruedLpAdminFees: "101",
    accruedLpManagerFees: "202",
    accruedLpProtocolFees: "303",
    lastManagementFeeUpdateTs: "404",
    harvestDisabled: true,
  });
  assert.doesNotThrow(() => JSON.stringify(snapshot));

  const filtered = await queryProtocolFeeVaults(ctx, {
    vaults: [managementVault, noFeeVault],
  });
  assert.equal(filtered.totalVaults, 3);
  assert.deepEqual(
    filtered.vaults.map(({ vault }) => vault),
    [managementVault]
  );
  assert.equal(filtered.vaults[0]?.harvestDisabled, false);
  assert.equal(filtered.vaults[0]?.protocolManagementFeeBps, 15);
});

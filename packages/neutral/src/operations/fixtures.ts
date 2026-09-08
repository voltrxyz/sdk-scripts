import { address } from "@solana/kit";
import type { BundleArgs } from "../generated/accounts/bundle.js";
import type { UserBundleAccountArgs } from "../generated/accounts/userBundleAccount.js";

const SYSTEM = address("11111111111111111111111111111111");
// Foreign-program account fixtures follow the vendored IDL; builders never fabricate onchain state.
export function bundleFixture(overrides: Partial<BundleArgs> = {}): BundleArgs {
  return {
    name: new Uint8Array(32),
    manager: SYSTEM,
    keeper: SYSTEM,
    treasuryAccount: SYSTEM,
    allocatedReceivers: [],
    bundleUnderlyingBalance: 0n,
    maxDepositAmount: 0n,
    withdrawalDelay: 0n,
    performanceFee: 0,
    managementFeeBps: 0,
    depositFee: 0,
    withdrawalFee: 0,
    managerPfeeShares: 0n,
    currentAllocationBps: 0,
    oracleBuffer: 0n,
    totalShares: 0n,
    assetPrecision: 0n,
    assetAddress: SYSTEM,
    assetDecimals: 0,
    withdrawalTMin: 0n,
    withdrawalTMax: 0n,
    withdrawalCurve: 1,
    permissionned: false,
    managerMfeeShares: 0n,
    minDepositAmount: 0n,
    oracleUpdateTimeLimit: 0n,
    oracleMaxAge: 0n,
    withdrawalRedemptionRequestCutoffTs: 0n,
    withdrawalRedemptionUnlockCurrentCycleTs: 0n,
    withdrawalRedemptionUnlockNextCycleTs: 0n,
    referrerEnabled: false,
    referrerMinDepositAmount: 0n,
    referralTiers: Array.from({ length: 5 }, () => ({
      threshold: 0n,
      pfeeBps: 0,
      mfeeBps: 0,
    })),
    tierCount: 0,
    padding: new Uint8Array(117),
    ...overrides,
  };
}
export function userFixture(
  overrides: Partial<UserBundleAccountArgs> = {}
): UserBundleAccountArgs {
  return {
    owner: SYSTEM,
    lastDepositTimestamp: 0n,
    shares: 0n,
    pendingDeposit: 0n,
    pendingShares: 0n,
    estimatedPendingWithdrawalValue: 0n,
    withdrawalAvailableTimestamp: 0n,
    lastWithdrawalProcessTimestamp: 0n,
    lastHighWaterMark: 0n,
    hwmPerShare: 0n,
    lastManagementFeeTimestamp: 0n,
    netDeposits: 0n,
    totalFeeCharged: 0n,
    customDepositFeeBps: 0,
    customWithdrawalFeeBps: 0,
    customPerformanceFeeBps: 0,
    customManagementFeeBps: 0,
    feeOverrideFlags: 0,
    customWithdrawalDelay: 0n,
    customWithdrawalTMin: 0n,
    customWithdrawalTMax: 0n,
    customWithdrawalCurve: 1,
    withdrawalTimingOverrideFlags: 0,
    switchActive: false,
    switchTargetBundle: SYSTEM,
    switchCreatedAt: 0n,
    referrer: SYSTEM,
    padding: new Uint8Array(145),
    ...overrides,
  };
}

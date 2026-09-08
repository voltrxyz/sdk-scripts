import type { ScriptContext } from "@voltr/scripts-core";
import {
  loadNeutralBundlePosition,
  type NeutralBundleAddressArgs,
} from "../bundle.js";

export async function queryNeutralBundleStatus(
  context: ScriptContext,
  args: NeutralBundleAddressArgs
) {
  const { bundle, accounts, user, receipt, strategyAtaAmount } =
    await loadNeutralBundlePosition(context, args);
  return {
    bundle: args.bundle,
    ...accounts,
    permissioned: bundle.permissionned,
    bundleManager: bundle.manager,
    depositorRegistered: user !== null,
    strategyInitialized: receipt !== null,
    receiptVersion: receipt?.version ?? null,
    accountingReady: receipt?.version === 2,
    shares: user?.shares.toString() ?? "0",
    pendingDeposit: user?.pendingDeposit.toString() ?? "0",
    pendingShares: user?.pendingShares.toString() ?? "0",
    estimatedPendingWithdrawalValue:
      user?.estimatedPendingWithdrawalValue.toString() ?? "0",
    withdrawalAvailableTimestamp:
      user?.withdrawalAvailableTimestamp.toString() ?? null,
    lastWithdrawalProcessTimestamp:
      user?.lastWithdrawalProcessTimestamp.toString() ?? null,
    switchActive: user?.switchActive ?? false,
    strategyAtaAmount: strategyAtaAmount.toString(),
    claimable:
      receipt?.version === 2 && user !== null && strategyAtaAmount > 0n,
    lastAccountedStrategyAtaAmount:
      receipt?.version === 2
        ? receipt.lastAccountedStrategyAtaAmount.toString()
        : null,
    storedPositionValue: receipt?.positionValue.toString() ?? null,
    lastAccountingTimestamp: receipt?.lastUpdatedTs.toString() ?? null,
  };
}

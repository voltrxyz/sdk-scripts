import { Option, type Command } from "commander";
import {
  createNoopSigner,
  generateKeyPairSigner,
  processOperation,
  requireNeutralBundle,
  requireVaultAddress,
  requireAssetMint,
  requireAssetTokenProgram,
  resolveLookupTableAddresses,
  type BuiltOperation,
  type ScriptContext,
} from "@voltr/scripts-core";
import {
  buildNeutralBundleInitOperation,
  buildNeutralBundleDepositOperation,
  buildNeutralBundleRefreshOperation,
  buildNeutralBundleRequestWithdrawOperation,
  buildNeutralBundleClaimOperation,
  buildNeutralBundleRegisterDepositorOperation,
  queryNeutralBundleStatus,
  U64_MAX,
  assertNeutralAmount,
  type NeutralBundleInitArgs,
} from "@voltr/scripts-neutral";
import { loadCommandContext, resolveProcessorOptions } from "../lib/globals.js";
import { addRoleKeypairOption, loadRoleSigner } from "../lib/signers.js";
import { parseAmount, parseAddress } from "../lib/parse.js";
import { printJson } from "../lib/output.js";
import { CliError } from "../lib/errors.js";

type Options = { managerKeypair?: string; amount?: string; all?: boolean };
type Builder = (
  context: ScriptContext,
  args: NeutralBundleInitArgs & { amount: bigint }
) => Promise<BuiltOperation>;

export function registerNeutralCommands(program: Command): void {
  const operations: Array<{
    action: string;
    summary: string;
    builder: Builder;
    amount?: boolean;
  }> = [
    {
      action: "init",
      summary: "initialize the Neutral strategy and create its settlement ATA",
      builder: buildNeutralBundleInitOperation,
    },
    {
      action: "deposit",
      summary: "request a bundle deposit; Neutral's keeper later issues shares",
      builder: buildNeutralBundleDepositOperation,
      amount: true,
    },
    {
      action: "refresh",
      summary: "refresh vault accounting with a zero-amount deposit",
      builder: buildNeutralBundleRefreshOperation,
    },
    {
      action: "request-withdraw",
      summary:
        "request redemption of a gross asset amount; wait for the keeper before claim",
      builder: buildNeutralBundleRequestWithdrawOperation,
      amount: true,
    },
    {
      action: "claim",
      summary:
        "sweep the entire available strategy ATA balance into vault idle",
      builder: buildNeutralBundleClaimOperation,
    },
    {
      action: "register-depositor",
      summary:
        "register the strategy authority on a permissioned bundle; signs as the Neutral bundle manager",
      builder: (context, args) =>
        buildNeutralBundleRegisterDepositorOperation(context, {
          ...args,
          bundleManager: args.manager,
        }),
    },
  ];
  for (const operation of operations) {
    const command = `neutral:bundle:${operation.action}`;
    const cli = addRoleKeypairOption(
      program.command(command).summary(operation.summary),
      "manager"
    );
    if (operation.action === "request-withdraw") {
      cli.addOption(
        new Option(
          "--amount <raw>",
          "gross asset minor units before withdrawal fees"
        ).conflicts("all")
      );
      cli.addOption(
        new Option("--all", "request all bundle shares").conflicts("amount")
      );
    } else if (operation.amount)
      cli.requiredOption("--amount <raw>", "asset minor units to deposit");
    cli.action(async (options: Options) => {
      let amount = 0n;
      if (operation.amount) {
        if (
          operation.action === "request-withdraw" &&
          options.amount === undefined &&
          !options.all
        )
          throw new CliError("Pass either --amount or --all");
        amount = options.all
          ? U64_MAX
          : parseAmount(options.amount!, "--amount");
        assertNeutralAmount(amount);
      }
      const { globals, profile, ctx } = await loadCommandContext(program);
      const args = {
        vault: requireVaultAddress(profile, { command }),
        bundle: requireNeutralBundle(profile, { command }),
        assetMint: requireAssetMint(profile),
        assetTokenProgram: requireAssetTokenProgram(profile),
        lookupTableAddresses: resolveLookupTableAddresses(profile, { command }),
      };
      const processorOptions = resolveProcessorOptions(globals);
      // The processor ignores payer in multisig mode; the operation uses the real multisig authority.
      const payer =
        globals.mode === "multisig"
          ? await generateKeyPairSigner()
          : await loadRoleSigner("manager", options.managerKeypair);
      const manager =
        globals.mode === "multisig"
          ? createNoopSigner(
              parseAddress(globals.multisigAddress!, "--multisig-address")
            )
          : payer;
      const built = await operation.builder(ctx, { ...args, manager, amount });
      await processOperation({
        ctx,
        payer,
        operation: built,
        mode: globals.mode,
        options: processorOptions,
      });
    });
  }
  program
    .command("neutral:bundle:query:status")
    .summary(
      "read pending deposits, redemptions, available tokens and receipt accounting; no signer required"
    )
    .action(async () => {
      const { profile, ctx } = await loadCommandContext(program);
      printJson(
        await queryNeutralBundleStatus(ctx, {
          vault: requireVaultAddress(profile),
          bundle: requireNeutralBundle(profile),
          assetMint: requireAssetMint(profile),
          assetTokenProgram: requireAssetTokenProgram(profile),
        })
      );
    });
}

import type { Command } from "commander";
import {
  asAddress,
  buildAcceptVaultAdminOperation,
  buildAddAdaptorOperation,
  buildCancelRequestWithdrawVaultOperation,
  buildDepositVaultOperation,
  buildHarvestFeeOperation,
  buildInitVaultOperation,
  buildInitVaultWithMetadataOperation,
  buildInstantWithdrawVaultOperation,
  buildRemoveAdaptorOperation,
  buildRequestWithdrawVaultOperation,
  buildSetTokenMetadataOperation,
  buildUpdateVaultConfigOperation,
  buildWithdrawVaultOperation,
  generateKeyPairSigner,
  parseBigintAmount,
  parseVaultConfigField,
  processOperation,
  queryStrategyPositions,
  queryVaultPosition,
  requireAssetMint,
  requireAssetTokenProgram,
  requireVaultAddress,
  resolveLookupTableAddresses,
  VAULT_CONFIG_FIELD_NAMES,
  vaultConfigFieldKind,
  type Address,
  type BuiltOperation,
  type KeyPairSigner,
  type LpTokenMetadata,
  type ScriptContext,
  type TxMode,
  type VaultConfigField,
  type VaultInitConfig,
} from "@voltr/scripts-core";
import { CliError } from "../lib/errors.js";
import { loadCommandContext, resolveProcessorOptions } from "../lib/globals.js";
import { loadRoleSigner } from "../lib/signers.js";
import { printJson, printLine } from "../lib/output.js";

// --- flag coercion helpers ---

/** Parse a raw u64 flag (smallest units / seconds), as a CliError on bad input. */
function parseRawU64(value: string, flag: string): bigint {
  if (!/^\d+$/.test(value)) {
    throw new CliError(
      `${flag} must be a non-negative integer in smallest units: ${value}`
    );
  }
  return BigInt(value);
}

/** Parse a raw u16 flag (0..65535), e.g. a fee in basis points. */
function parseRawU16(value: string, flag: string): number {
  if (!/^\d+$/.test(value)) {
    throw new CliError(`${flag} must be a non-negative integer: ${value}`);
  }
  const parsed = Number(value);
  if (parsed > 65_535) {
    throw new CliError(`${flag} must be a u16 in the range 0..65535: ${value}`);
  }
  return parsed;
}

/** Coerce the `--value` flag for vault:update-config to the field's value type. */
function coerceConfigValue(
  field: VaultConfigField,
  raw: string
): bigint | number | Address {
  switch (vaultConfigFieldKind(field)) {
    case "u64":
      return parseRawU64(raw, "--value");
    case "u16":
      return parseRawU16(raw, "--value");
    case "address":
      return asAddress(raw, "--value");
  }
}

// --- shared withdrawal flags (request-withdraw + instant-withdraw) ---

interface WithdrawAmountOptions {
  amount: string;
  inLp?: boolean;
  all?: boolean;
}

function addWithdrawAmountOptions(command: Command): Command {
  return command
    .requiredOption(
      "--amount <raw>",
      "raw amount in smallest units (LP units when --in-lp)"
    )
    .option("--in-lp", "interpret --amount as LP tokens instead of asset units")
    .option("--all", "withdraw the entire position (overrides --amount)");
}

function parseWithdrawAmountOptions(options: WithdrawAmountOptions): {
  amount: bigint;
  isAmountInLp: boolean;
  isWithdrawAll: boolean;
} {
  return {
    amount: parseBigintAmount(options.amount),
    isAmountInLp: Boolean(options.inLp),
    isWithdrawAll: Boolean(options.all),
  };
}

// --- shared vault-initialization flags (init + init-and-set-token-metadata) ---

interface InitConfigOptions {
  manager: string;
  name: string;
  description: string;
  maxCap: string;
  startAtTs: string;
  managerPerformanceFee: string;
  adminPerformanceFee: string;
  managerManagementFee: string;
  adminManagementFee: string;
  lockedProfitDegradationDuration: string;
  redemptionFee: string;
  issuanceFee: string;
  withdrawalWaitingPeriod: string;
}

/**
 * Vault-initialization flags shared by both init commands. The fee, duration,
 * and timestamp fields default to 0 (matching the legacy config defaults), so a
 * minimal init only needs `--manager`, `--name`, and `--max-cap`.
 */
function addInitConfigOptions(command: Command): Command {
  return command
    .requiredOption(
      "--manager <address>",
      "vault manager address (controls strategy allocation)"
    )
    .requiredOption("--name <name>", "vault name")
    .option("--description <text>", "vault description", "")
    .requiredOption(
      "--max-cap <raw>",
      "max deposit cap, asset smallest units"
    )
    .option(
      "--start-at-ts <ts>",
      "unix timestamp deposits open at (0 = immediately)",
      "0"
    )
    .option(
      "--manager-performance-fee <bps>",
      "manager performance fee, basis points",
      "0"
    )
    .option(
      "--admin-performance-fee <bps>",
      "admin performance fee, basis points",
      "0"
    )
    .option(
      "--manager-management-fee <bps>",
      "manager management fee, basis points",
      "0"
    )
    .option(
      "--admin-management-fee <bps>",
      "admin management fee, basis points",
      "0"
    )
    .option(
      "--locked-profit-degradation-duration <secs>",
      "locked-profit degradation duration, seconds",
      "0"
    )
    .option("--redemption-fee <bps>", "redemption fee, basis points", "0")
    .option("--issuance-fee <bps>", "issuance fee, basis points", "0")
    .option(
      "--withdrawal-waiting-period <secs>",
      "withdrawal waiting period, seconds",
      "0"
    );
}

interface ParsedInit {
  manager: Address;
  name: string;
  description: string;
  config: VaultInitConfig;
}

function parseInitConfigOptions(options: InitConfigOptions): ParsedInit {
  return {
    manager: asAddress(options.manager, "--manager"),
    name: options.name,
    description: options.description,
    config: {
      maxCap: parseRawU64(options.maxCap, "--max-cap"),
      startAtTs: parseRawU64(options.startAtTs, "--start-at-ts"),
      managerPerformanceFee: parseRawU16(
        options.managerPerformanceFee,
        "--manager-performance-fee"
      ),
      adminPerformanceFee: parseRawU16(
        options.adminPerformanceFee,
        "--admin-performance-fee"
      ),
      managerManagementFee: parseRawU16(
        options.managerManagementFee,
        "--manager-management-fee"
      ),
      adminManagementFee: parseRawU16(
        options.adminManagementFee,
        "--admin-management-fee"
      ),
      lockedProfitDegradationDuration: parseRawU64(
        options.lockedProfitDegradationDuration,
        "--locked-profit-degradation-duration"
      ),
      redemptionFee: parseRawU16(options.redemptionFee, "--redemption-fee"),
      issuanceFee: parseRawU16(options.issuanceFee, "--issuance-fee"),
      withdrawalWaitingPeriod: parseRawU64(
        options.withdrawalWaitingPeriod,
        "--withdrawal-waiting-period"
      ),
    },
  };
}

// --- shared LP-token metadata flags (init-and-set + set-token-metadata) ---

interface MetadataOptions {
  metadataName: string;
  metadataSymbol: string;
  metadataUri: string;
}

function addMetadataOptions(command: Command): Command {
  return command
    .requiredOption("--metadata-name <name>", "LP token name")
    .requiredOption("--metadata-symbol <symbol>", "LP token symbol")
    .requiredOption("--metadata-uri <uri>", "LP token metadata URI");
}

function parseMetadataOptions(options: MetadataOptions): LpTokenMetadata {
  return {
    name: options.metadataName,
    symbol: options.metadataSymbol,
    uri: options.metadataUri,
  };
}

/**
 * Reject `--mode multisig` for the init commands. Each generates a fresh vault
 * keypair that must sign the initialization instruction, but the multisig
 * payload carries no signatures and is built over a placeholder blockhash — so
 * that ephemeral signature can never be supplied and the emitted payload would
 * be unexecutable. Fail up front (before generating a throwaway keypair) instead
 * of handing the operator a broken payload.
 */
function assertInitModeSupported(mode: TxMode, command: string): void {
  if (mode === "multisig") {
    throw new CliError(
      `${command} does not support --mode multisig: it generates a new vault keypair that must sign initialization, and a multisig payload cannot carry that signature. Use --mode execute (or --mode print / simulate to preview).`
    );
  }
}

// --- adaptor allowlist commands (vault:add-adaptor / vault:remove-adaptor) ---

interface AdaptorAdminArgs {
  admin: KeyPairSigner;
  vault: Address;
  adaptorProgram: Address;
  lookupTableAddresses?: Address[];
}

type AdaptorAdminBuilder = (
  ctx: ScriptContext,
  args: AdaptorAdminArgs
) => Promise<BuiltOperation>;

/**
 * Register an adaptor allowlist command (`vault:add-adaptor` /
 * `vault:remove-adaptor`). Both are admin-signed, take a single
 * `--adaptor-program` flag, and differ only by builder and verb. The program ID
 * is a flag (not a profile field) so one command serves every adapter — pass the
 * adapter package's exported constant, e.g. Trustful's
 * `3pnpK9nrs1R65eMV1wqCXkDkhSgN18xb1G5pgYPwoZjJ`.
 */
function registerAdaptorAdminCommand(
  program: Command,
  command: "vault:add-adaptor" | "vault:remove-adaptor",
  builder: AdaptorAdminBuilder
): void {
  const isAdd = command.endsWith("add-adaptor");
  const verb = isAdd ? "Register" : "Deregister";
  const preposition = isAdd ? "on" : "from";
  program
    .command(command)
    .summary(
      `${isAdd ? "register" : "deregister"} an adaptor program ${preposition} the vault`
    )
    .description(
      `${verb} an adaptor program ${preposition} the vault. Signs as the vault admin.`
    )
    .option(
      "--admin-keypair <path>",
      "admin keypair JSON path (or ADMIN_KEYPAIR env)"
    )
    .requiredOption(
      "--adaptor-program <address>",
      "adaptor program id (e.g. an adapter package constant)"
    )
    .action(
      async (options: { adminKeypair?: string; adaptorProgram: string }) => {
        const { globals, profile, ctx } = await loadCommandContext(program);
        const vault = requireVaultAddress(profile, { command });
        const adaptorProgram = asAddress(
          options.adaptorProgram,
          "--adaptor-program"
        );
        const lookupTableAddresses = resolveLookupTableAddresses(profile, {
          command,
        });
        const processorOptions = resolveProcessorOptions(globals);
        const admin = await loadRoleSigner("admin", options.adminKeypair);

        const operation = await builder(ctx, {
          admin,
          vault,
          adaptorProgram,
          lookupTableAddresses,
        });

        await processOperation({
          ctx,
          payer: admin,
          operation,
          mode: globals.mode,
          options: processorOptions,
        });
      }
    );
}

/** Admin operations: vault lifecycle, config, and fee harvesting. */
function registerAdminVaultCommands(program: Command): void {
  const initCommand = program
    .command("vault:init")
    .summary("initialize a new Voltr vault")
    .description(
      "Initialize a new Voltr vault. A fresh vault keypair is generated for this run; its address is printed so you can record it as vault.vaultAddress in your profile after a successful --mode execute."
    )
    .option(
      "--admin-keypair <path>",
      "admin keypair JSON path (or ADMIN_KEYPAIR env)"
    );
  addInitConfigOptions(initCommand).action(
    async (options: InitConfigOptions & { adminKeypair?: string }) => {
      const command = "vault:init";

      const { globals, profile, ctx } = await loadCommandContext(program);
      assertInitModeSupported(globals.mode, command);
      const assetMint = requireAssetMint(profile);
      const assetTokenProgram = requireAssetTokenProgram(profile);
      const lookupTableAddresses = resolveLookupTableAddresses(profile, {
        command,
      });
      const init = parseInitConfigOptions(options);
      const processorOptions = resolveProcessorOptions(globals);
      const admin = await loadRoleSigner("admin", options.adminKeypair);
      const vault = await generateKeyPairSigner();

      const operation = await buildInitVaultOperation(ctx, {
        admin,
        manager: init.manager,
        vault,
        assetMint,
        assetTokenProgram,
        config: init.config,
        name: init.name,
        description: init.description,
        lookupTableAddresses,
      });

      await processOperation({
        ctx,
        payer: admin,
        operation,
        mode: globals.mode,
        options: processorOptions,
      });

      printVaultAddress(vault.address);
    }
  );

  const initWithMetadataCommand = program
    .command("vault:init-and-set-token-metadata")
    .summary("initialize a vault and set its LP token metadata")
    .description(
      "Initialize a new Voltr vault and create its LP token metadata in one transaction. See vault:init for how the generated vault address is reported."
    )
    .option(
      "--admin-keypair <path>",
      "admin keypair JSON path (or ADMIN_KEYPAIR env)"
    );
  addMetadataOptions(addInitConfigOptions(initWithMetadataCommand)).action(
    async (
      options: InitConfigOptions & MetadataOptions & { adminKeypair?: string }
    ) => {
      const command = "vault:init-and-set-token-metadata";

      const { globals, profile, ctx } = await loadCommandContext(program);
      assertInitModeSupported(globals.mode, command);
      const assetMint = requireAssetMint(profile);
      const assetTokenProgram = requireAssetTokenProgram(profile);
      const lookupTableAddresses = resolveLookupTableAddresses(profile, {
        command,
      });
      const init = parseInitConfigOptions(options);
      const lpTokenMetadata = parseMetadataOptions(options);
      const processorOptions = resolveProcessorOptions(globals);
      const admin = await loadRoleSigner("admin", options.adminKeypair);
      const vault = await generateKeyPairSigner();

      const operation = await buildInitVaultWithMetadataOperation(ctx, {
        admin,
        manager: init.manager,
        vault,
        assetMint,
        assetTokenProgram,
        config: init.config,
        name: init.name,
        description: init.description,
        lpTokenMetadata,
        lookupTableAddresses,
      });

      await processOperation({
        ctx,
        payer: admin,
        operation,
        mode: globals.mode,
        options: processorOptions,
      });

      printVaultAddress(vault.address);
    }
  );

  const setMetadataCommand = program
    .command("vault:set-token-metadata")
    .summary("set LP token metadata for an existing vault")
    .description(
      "Create the LP token metadata account for an already-initialized vault."
    )
    .option(
      "--admin-keypair <path>",
      "admin keypair JSON path (or ADMIN_KEYPAIR env)"
    );
  addMetadataOptions(setMetadataCommand).action(
    async (options: MetadataOptions & { adminKeypair?: string }) => {
      const command = "vault:set-token-metadata";

      const { globals, profile, ctx } = await loadCommandContext(program);
      const vault = requireVaultAddress(profile, { command });
      const lookupTableAddresses = resolveLookupTableAddresses(profile, {
        command,
      });
      const lpTokenMetadata = parseMetadataOptions(options);
      const processorOptions = resolveProcessorOptions(globals);
      const admin = await loadRoleSigner("admin", options.adminKeypair);

      const operation = await buildSetTokenMetadataOperation(ctx, {
        admin,
        vault,
        lpTokenMetadata,
        lookupTableAddresses,
      });

      await processOperation({
        ctx,
        payer: admin,
        operation,
        mode: globals.mode,
        options: processorOptions,
      });
    }
  );

  program
    .command("vault:update-config")
    .summary("update a single vault config field")
    .description(
      `Update one vault configuration field.\nFields: ${VAULT_CONFIG_FIELD_NAMES.join(
        ", "
      )}.`
    )
    .option(
      "--admin-keypair <path>",
      "admin keypair JSON path (or ADMIN_KEYPAIR env)"
    )
    .requiredOption(
      "--field <name>",
      `config field to update (one of: ${VAULT_CONFIG_FIELD_NAMES.join(", ")})`
    )
    .requiredOption(
      "--value <value>",
      "new value: raw integer for numeric fields, base58 address for manager / pending-admin"
    )
    .action(
      async (options: {
        adminKeypair?: string;
        field: string;
        value: string;
      }) => {
        const command = "vault:update-config";

        const { globals, profile, ctx } = await loadCommandContext(program);
        const vault = requireVaultAddress(profile, { command });
        const lookupTableAddresses = resolveLookupTableAddresses(profile, {
          command,
        });
        const field = parseVaultConfigField(options.field);
        const value = coerceConfigValue(field, options.value);
        const processorOptions = resolveProcessorOptions(globals);
        const admin = await loadRoleSigner("admin", options.adminKeypair);

        const operation = await buildUpdateVaultConfigOperation(ctx, {
          admin,
          vault,
          field,
          value,
          lookupTableAddresses,
        });

        await processOperation({
          ctx,
          payer: admin,
          operation,
          mode: globals.mode,
          options: processorOptions,
        });
      }
    );

  program
    .command("vault:accept-admin")
    .summary("accept a pending vault admin transfer")
    .description(
      "Accept the pending-admin role for the vault. Sign with the incoming admin keypair (the pending admin set via vault:update-config --field pending-admin)."
    )
    .option(
      "--admin-keypair <path>",
      "pending admin keypair JSON path (or ADMIN_KEYPAIR env)"
    )
    .action(async (options: { adminKeypair?: string }) => {
      const command = "vault:accept-admin";

      const { globals, profile, ctx } = await loadCommandContext(program);
      const vault = requireVaultAddress(profile, { command });
      const lookupTableAddresses = resolveLookupTableAddresses(profile, {
        command,
      });
      const processorOptions = resolveProcessorOptions(globals);
      const pendingAdmin = await loadRoleSigner("admin", options.adminKeypair);

      const operation = await buildAcceptVaultAdminOperation(ctx, {
        pendingAdmin,
        vault,
        lookupTableAddresses,
      });

      await processOperation({
        ctx,
        payer: pendingAdmin,
        operation,
        mode: globals.mode,
        options: processorOptions,
      });
    });

  program
    .command("vault:harvest-fee")
    .summary("harvest accrued vault fees")
    .description(
      "Harvest accrued fees into the vault admin, manager, and protocol admin LP accounts. Signs as the vault admin (the harvester)."
    )
    .option(
      "--admin-keypair <path>",
      "admin keypair JSON path (or ADMIN_KEYPAIR env)"
    )
    .requiredOption(
      "--manager <address>",
      "vault manager address (receives the manager fee share)"
    )
    .action(async (options: { adminKeypair?: string; manager: string }) => {
      const command = "vault:harvest-fee";

      const { globals, profile, ctx } = await loadCommandContext(program);
      const vault = requireVaultAddress(profile, { command });
      const lookupTableAddresses = resolveLookupTableAddresses(profile, {
        command,
      });
      const manager = asAddress(options.manager, "--manager");
      const processorOptions = resolveProcessorOptions(globals);
      const admin = await loadRoleSigner("admin", options.adminKeypair);

      const operation = await buildHarvestFeeOperation(ctx, {
        admin,
        manager,
        vault,
        lookupTableAddresses,
      });

      await processOperation({
        ctx,
        payer: admin,
        operation,
        mode: globals.mode,
        options: processorOptions,
      });
    });

  registerAdaptorAdminCommand(
    program,
    "vault:add-adaptor",
    buildAddAdaptorOperation
  );
  registerAdaptorAdminCommand(
    program,
    "vault:remove-adaptor",
    buildRemoveAdaptorOperation
  );
}

/** User operations: deposit and the withdrawal flows. */
function registerUserVaultCommands(program: Command): void {
  program
    .command("vault:deposit")
    .summary("deposit the profile asset into the vault")
    .description("Deposit the profile asset into the configured Voltr vault.")
    .option(
      "--user-keypair <path>",
      "user keypair JSON path (or USER_KEYPAIR env)"
    )
    .requiredOption("--amount <raw>", "raw asset amount in smallest units")
    .action(async (options: { userKeypair?: string; amount: string }) => {
      const command = "vault:deposit";

      // Validate the profile (and the fields this command needs) before we
      // touch the network, load any key, or build instructions.
      const { globals, profile, ctx } = await loadCommandContext(program);
      const vault = requireVaultAddress(profile, { command });
      const assetMint = requireAssetMint(profile);
      const assetTokenProgram = requireAssetTokenProgram(profile);
      const lookupTableAddresses = resolveLookupTableAddresses(profile, {
        command,
      });
      const amount = parseBigintAmount(options.amount);
      const processorOptions = resolveProcessorOptions(globals);
      const user = await loadRoleSigner("user", options.userKeypair);

      const operation = await buildDepositVaultOperation(ctx, {
        user,
        vault,
        assetMint,
        assetTokenProgram,
        amount,
        lookupTableAddresses,
      });

      await processOperation({
        ctx,
        payer: user,
        operation,
        mode: globals.mode,
        options: processorOptions,
      });
    });

  const requestWithdrawCommand = program
    .command("vault:request-withdraw")
    .summary("request a withdrawal from the vault")
    .description(
      "Request a withdrawal. Only one request can be outstanding per user per vault; a second request fails while one is pending/unclaimed."
    )
    .option(
      "--user-keypair <path>",
      "user keypair JSON path (or USER_KEYPAIR env)"
    );
  addWithdrawAmountOptions(requestWithdrawCommand).action(
    async (options: WithdrawAmountOptions & { userKeypair?: string }) => {
      const command = "vault:request-withdraw";

      const { globals, profile, ctx } = await loadCommandContext(program);
      const vault = requireVaultAddress(profile, { command });
      const lookupTableAddresses = resolveLookupTableAddresses(profile, {
        command,
      });
      const { amount, isAmountInLp, isWithdrawAll } =
        parseWithdrawAmountOptions(options);
      const processorOptions = resolveProcessorOptions(globals);
      const user = await loadRoleSigner("user", options.userKeypair);

      const operation = await buildRequestWithdrawVaultOperation(ctx, {
        user,
        vault,
        amount,
        isAmountInLp,
        isWithdrawAll,
        lookupTableAddresses,
      });

      await processOperation({
        ctx,
        payer: user,
        operation,
        mode: globals.mode,
        options: processorOptions,
      });
    }
  );

  program
    .command("vault:cancel-request-withdraw")
    .summary("cancel an outstanding withdrawal request")
    .description(
      "Cancel an outstanding withdrawal request. Only succeeds when the user has a request outstanding for the vault."
    )
    .option(
      "--user-keypair <path>",
      "user keypair JSON path (or USER_KEYPAIR env)"
    )
    .action(async (options: { userKeypair?: string }) => {
      const command = "vault:cancel-request-withdraw";

      const { globals, profile, ctx } = await loadCommandContext(program);
      const vault = requireVaultAddress(profile, { command });
      const lookupTableAddresses = resolveLookupTableAddresses(profile, {
        command,
      });
      const processorOptions = resolveProcessorOptions(globals);
      const user = await loadRoleSigner("user", options.userKeypair);

      const operation = await buildCancelRequestWithdrawVaultOperation(ctx, {
        user,
        vault,
        lookupTableAddresses,
      });

      await processOperation({
        ctx,
        payer: user,
        operation,
        mode: globals.mode,
        options: processorOptions,
      });
    });

  program
    .command("vault:withdraw")
    .summary("claim a previously requested withdrawal")
    .description(
      "Claim a previously requested withdrawal once any waiting period has passed. The on-chain program throws if no request is outstanding."
    )
    .option(
      "--user-keypair <path>",
      "user keypair JSON path (or USER_KEYPAIR env)"
    )
    .action(async (options: { userKeypair?: string }) => {
      const command = "vault:withdraw";

      const { globals, profile, ctx } = await loadCommandContext(program);
      const vault = requireVaultAddress(profile, { command });
      const assetMint = requireAssetMint(profile);
      const assetTokenProgram = requireAssetTokenProgram(profile);
      const lookupTableAddresses = resolveLookupTableAddresses(profile, {
        command,
      });
      const processorOptions = resolveProcessorOptions(globals);
      const user = await loadRoleSigner("user", options.userKeypair);

      const operation = await buildWithdrawVaultOperation(ctx, {
        user,
        vault,
        assetMint,
        assetTokenProgram,
        lookupTableAddresses,
      });

      await processOperation({
        ctx,
        payer: user,
        operation,
        mode: globals.mode,
        options: processorOptions,
      });
    });

  const instantWithdrawCommand = program
    .command("vault:instant-withdraw")
    .summary("withdraw immediately against idle vault assets")
    .description(
      "Redeem LP directly against the vault's idle assets in a single transaction (no request/claim cycle)."
    )
    .option(
      "--user-keypair <path>",
      "user keypair JSON path (or USER_KEYPAIR env)"
    );
  addWithdrawAmountOptions(instantWithdrawCommand).action(
    async (options: WithdrawAmountOptions & { userKeypair?: string }) => {
      const command = "vault:instant-withdraw";

      const { globals, profile, ctx } = await loadCommandContext(program);
      const vault = requireVaultAddress(profile, { command });
      const assetMint = requireAssetMint(profile);
      const assetTokenProgram = requireAssetTokenProgram(profile);
      const lookupTableAddresses = resolveLookupTableAddresses(profile, {
        command,
      });
      const { amount, isAmountInLp, isWithdrawAll } =
        parseWithdrawAmountOptions(options);
      const processorOptions = resolveProcessorOptions(globals);
      const user = await loadRoleSigner("user", options.userKeypair);

      const operation = await buildInstantWithdrawVaultOperation(ctx, {
        user,
        vault,
        assetMint,
        assetTokenProgram,
        amount,
        isAmountInLp,
        isWithdrawAll,
        lookupTableAddresses,
      });

      await processOperation({
        ctx,
        payer: user,
        operation,
        mode: globals.mode,
        options: processorOptions,
      });
    }
  );
}

/**
 * Read-only vault queries (`vault:query:*`). These never build a transaction,
 * so they ignore `--mode` and need no signer keypair — only a `--user` address
 * for the position query.
 */
function registerVaultQueryCommands(program: Command): void {
  program
    .command("vault:query:position")
    .summary("print a user's vault position as JSON")
    .description(
      "Read a user's LP balance and withdrawable asset value (before and after fees) for the configured vault. Read-only: ignores --mode and needs no keypair."
    )
    .requiredOption("--user <address>", "user address to query")
    .action(async (options: { user: string }) => {
      const command = "vault:query:position";

      const { profile, ctx } = await loadCommandContext(program);
      const vault = requireVaultAddress(profile, { command });
      const user = asAddress(options.user, "--user");

      const snapshot = await queryVaultPosition(ctx, { user, vault });
      printJson(snapshot);
    });

  program
    .command("vault:query:strategy-positions")
    .summary("print the vault's per-strategy positions as JSON")
    .description(
      "Read the vault's total value and per-strategy position values. Read-only: ignores --mode and needs no keypair."
    )
    .action(async () => {
      const command = "vault:query:strategy-positions";

      const { profile, ctx } = await loadCommandContext(program);
      const vault = requireVaultAddress(profile, { command });

      const snapshot = await queryStrategyPositions(ctx, { vault });
      printJson(snapshot);
    });
}

/** Print the freshly generated vault address from an init command. */
function printVaultAddress(vault: Address): void {
  printLine(`Generated vault address: ${vault}`);
  printLine(
    "Record this as vault.vaultAddress in your profile after a successful --mode execute run."
  );
}

/** Shared vault operations (`vault:*`). */
export function registerVaultCommands(program: Command): void {
  registerAdminVaultCommands(program);
  registerUserVaultCommands(program);
  registerVaultQueryCommands(program);
}

/**
 * The shared example harness — the examples' small `utils/` layer.
 *
 * Every example file declares one action with `defineExample("<name>", body)`,
 * exports it as default, and ends with `runIfMain(import.meta.url, …)` so the
 * file is a real executable entry point. The same module is imported by the
 * `pnpm example` dispatcher and by `pnpm examples:check`, so running a file
 * directly and running it via `pnpm example` exercise identical code.
 *
 * You can run a file with NO arguments — configuration falls back to environment
 * variables and defaults:
 *
 *   VOLTR_PROFILE   JSON profile path (default: configs/my-vault.json)
 *   VOLTR_MODE      print | simulate | multisig | execute (default: print)
 *   RPC_URL         RPC endpoint (or HELIUS_RPC_URL, or profile.rpcUrl)
 *   ADMIN_KEYPAIR / MANAGER_KEYPAIR / USER_KEYPAIR   keypair JSON paths
 *   VOLTR_MULTISIG_ADDRESS   vault PDA (only for multisig mode)
 *   VOLTR_CONFIRM   set to 1/yes to skip the execute confirmation prompt
 *
 * …and every setting also has an equivalent flag that overrides the env var:
 *   --profile <path> --rpc-url <url> --mode <mode> --multisig-address <addr>
 *   --yes   --help
 *
 * Per-run values (amounts, rates) are constants at the top of each example file.
 */
import { createInterface } from "node:readline/promises";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import {
  asAddress,
  createScriptContext,
  loadProfile,
  loadSignerFromFile,
  processOperation,
  ProfileFieldError,
  ProfileValidationError,
  type BuiltOperation,
  type KeyPairSigner,
  type ProcessorOptions,
  type ScriptContext,
  type ScriptProfile,
  type TxMode,
} from "@voltr/scripts-core";
import * as output from "./output.js";
import { findMeta } from "../registry.js";

export type Role = "admin" | "manager" | "user";

export const ROLE_ENV_VAR: Record<Role, string> = {
  admin: "ADMIN_KEYPAIR",
  manager: "MANAGER_KEYPAIR",
  user: "USER_KEYPAIR",
};

export const TX_MODES: readonly TxMode[] = [
  "print",
  "simulate",
  "multisig",
  "execute",
];

/** Transaction examples default to `print` — never `execute`. */
export const DEFAULT_MODE: TxMode = "print";

export type ExampleGroup =
  | "vault"
  | "kamino"
  | "spot"
  | "trustful"
  | "composition";

export type ExampleNetwork = "none" | "rpc-read" | "rpc-and-http";

/** Catalog metadata for an example, kept centrally in `registry.ts`. */
export interface ExampleMeta {
  /** Dispatch key for `pnpm example -- <name>`. */
  name: string;
  /** Repo-root-relative path to the file, e.g. `examples/src/vault/deposit.ts`. */
  file: string;
  group: ExampleGroup;
  /** Signer role; `none` marks a read-only example needing no keypair. */
  role: Role | "none";
  network: ExampleNetwork;
  summary: string;
  /** False for read-only query examples that never build a transaction. */
  transactional: boolean;
  /** True if the builder can be exercised offline (used by examples:check). */
  offline: boolean;
}

/** A user-facing problem (bad config, missing keypair); printed without a stack. */
export class ExampleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExampleError";
  }
}

/** What each example's body receives. */
export interface Harness {
  readonly profile: ScriptProfile;
  readonly ctx: ScriptContext;
  readonly mode: TxMode;
  /** Load a role's keypair from its flag / `<ROLE>_KEYPAIR` env var (cached). */
  signer(role: Role): Promise<KeyPairSigner>;
  /** Print a summary of the operation, then process it in the selected mode. */
  process(operation: BuiltOperation, payer: KeyPairSigner): Promise<void>;
  heading(text: string): void;
  line(text?: string): void;
  field(label: string, value: string): void;
  note(text: string): void;
  json(value: unknown): void;
}

export interface Example {
  name: string;
  run(h: Harness): Promise<void>;
}

/** Declare an example. The body is shared by direct runs, the dispatcher, and the check. */
export function defineExample(
  name: string,
  run: (h: Harness) => Promise<void>
): Example {
  return { name, run };
}

interface ResolvedConfig {
  profilePath: string;
  mode: TxMode;
  rpcUrlOverride?: string;
  multisigAddress?: string;
  confirm: boolean;
}

function parse(argv: string[]): {
  values: Record<string, string | boolean | undefined>;
} {
  try {
    const { values } = parseArgs({
      args: argv,
      allowPositionals: true,
      strict: true,
      options: {
        profile: { type: "string" },
        "rpc-url": { type: "string" },
        mode: { type: "string" },
        "multisig-address": { type: "string" },
        yes: { type: "boolean" },
        help: { type: "boolean" },
      },
    });
    return { values };
  } catch (error) {
    throw new ExampleError(
      `${(error as Error).message}\nRun with --help to see the accepted flags. ` +
        "Per-run values (amounts, rates) are constants at the top of the example file."
    );
  }
}

function resolveConfig(
  values: Record<string, string | boolean | undefined>
): ResolvedConfig {
  const modeRaw =
    (values.mode as string | undefined) ?? process.env.VOLTR_MODE ?? DEFAULT_MODE;
  if (!TX_MODES.includes(modeRaw as TxMode)) {
    throw new ExampleError(
      `Invalid mode "${modeRaw}". Use one of: ${TX_MODES.join(", ")}.`
    );
  }
  const ack = (process.env.VOLTR_CONFIRM ?? "").toLowerCase();
  return {
    profilePath:
      (values.profile as string | undefined) ??
      process.env.VOLTR_PROFILE ??
      "configs/my-vault.json",
    mode: modeRaw as TxMode,
    rpcUrlOverride: (values["rpc-url"] as string | undefined) ?? process.env.RPC_URL,
    multisigAddress:
      (values["multisig-address"] as string | undefined) ??
      process.env.VOLTR_MULTISIG_ADDRESS,
    confirm:
      values.yes === true || ack === "1" || ack === "yes" || ack === "true",
  };
}

async function loadHarnessProfile(profilePath: string): Promise<ScriptProfile> {
  try {
    return await loadProfile(profilePath);
  } catch (error) {
    if (error instanceof ProfileValidationError) throw error;
    throw new ExampleError(
      `Could not read profile "${profilePath}": ${(error as Error).message}\n` +
        "Copy configs/examples/usdc.mainnet.example.json to configs/my-vault.json " +
        "(or pass --profile / set VOLTR_PROFILE) and fill in your vault's addresses."
    );
  }
}

async function confirmExecute(label: string, config: ResolvedConfig): Promise<void> {
  output.line(`\n⚠️  --mode execute will SEND a real transaction (${label}).`);
  if (config.confirm) {
    output.note("proceeding (--yes / VOLTR_CONFIRM set).");
    return;
  }
  if (!process.stdin.isTTY) {
    throw new ExampleError(
      "execute requires confirmation. Pass --yes (or set VOLTR_CONFIRM=1) in a non-interactive shell."
    );
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question("Type 'yes' to send: ");
    if (answer.trim().toLowerCase() !== "yes") {
      throw new ExampleError("Aborted: execute not confirmed.");
    }
  } finally {
    rl.close();
  }
}

function buildHarness(
  profile: ScriptProfile,
  ctx: ScriptContext,
  config: ResolvedConfig
): Harness {
  const signers = new Map<Role, KeyPairSigner>();
  let confirmed = false;

  return {
    profile,
    ctx,
    mode: config.mode,
    async signer(role) {
      const cached = signers.get(role);
      if (cached) return cached;
      const path = process.env[ROLE_ENV_VAR[role]];
      if (!path) {
        throw new ExampleError(
          `Missing ${role} keypair. Set ${ROLE_ENV_VAR[role]} to a keypair JSON path.`
        );
      }
      let signer: KeyPairSigner;
      try {
        signer = await loadSignerFromFile(path);
      } catch (error) {
        throw new ExampleError(
          `Failed to load ${role} keypair from "${path}": ${(error as Error).message}`
        );
      }
      signers.set(role, signer);
      return signer;
    },
    async process(operation, payer) {
      output.printOperation(operation);
      if (config.mode === "execute" && !confirmed) {
        await confirmExecute(operation.label, config);
        confirmed = true;
      }
      const options: ProcessorOptions = {};
      if (config.mode === "multisig") {
        if (!config.multisigAddress) {
          throw new ExampleError(
            "multisig mode requires --multisig-address (or VOLTR_MULTISIG_ADDRESS)."
          );
        }
        try {
          options.multisigAddress = asAddress(config.multisigAddress);
        } catch {
          throw new ExampleError(
            `multisig address must be valid base58: ${config.multisigAddress}`
          );
        }
      }
      await processOperation({ ctx, payer, operation, mode: config.mode, options });
    },
    heading: output.heading,
    line: output.line,
    field: output.field,
    note: output.note,
    json: output.json,
  };
}

/**
 * Parse args, handle `--help` (with no profile/keypair/network), then run the
 * example. Used by both direct execution (`runIfMain`) and the dispatcher.
 */
export async function runExample(example: Example, argv: string[]): Promise<void> {
  const { values } = parse(argv);
  const meta = findMeta(example.name);

  if (values.help === true) {
    output.line(renderHelp(example.name, meta));
    return;
  }

  const config = resolveConfig(values);
  const profile = await loadHarnessProfile(config.profilePath);
  const ctx = createScriptContext(profile, config.rpcUrlOverride);
  const h = buildHarness(profile, ctx, config);
  await example.run(h);
}

/** Build `--help` text for an example from its registry metadata. */
export function renderHelp(name: string, meta?: ExampleMeta): string {
  const lines: string[] = [];
  lines.push(`${name}${meta ? ` — ${meta.summary}` : ""}`);
  lines.push("");
  lines.push("Usage:");
  if (meta) lines.push(`  pnpm exec tsx ${meta.file} [flags]`);
  lines.push(`  pnpm example -- ${name} [flags]`);
  lines.push("");
  if (meta) {
    lines.push(`Group:   ${meta.group}`);
    lines.push(
      `Role:    ${
        meta.role === "none"
          ? "none (read-only, no keypair)"
          : `${meta.role} (set ${ROLE_ENV_VAR[meta.role as Role]})`
      }`
    );
    lines.push(`Network: ${describeNetwork(meta.network)}`);
    lines.push("");
  }
  lines.push("Per-run values (amounts, rates) are constants at the top of the file.");
  lines.push("");
  lines.push("Flags (each also has a VOLTR_* env equivalent):");
  lines.push("  --profile <path>            JSON profile (default: configs/my-vault.json)");
  lines.push("  --rpc-url <url>             RPC URL override");
  if (!meta || meta.transactional) {
    lines.push("  --mode <mode>              print | simulate | multisig | execute (default: print)");
    lines.push("  --multisig-address <addr>  vault PDA (for --mode multisig)");
    lines.push("  --yes                      acknowledge --mode execute non-interactively");
  }
  lines.push("  --help                     show this help and exit");
  return lines.join("\n");
}

function describeNetwork(network: ExampleNetwork): string {
  switch (network) {
    case "none":
      return "none — builds offline in print mode";
    case "rpc-read":
      return "rpc-read — reads accounts via RPC even in print mode";
    case "rpc-and-http":
      return "rpc-and-http — RPC reads plus a Jupiter HTTP quote";
  }
}

function isEntry(importMetaUrl: string): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return realpathSync(entry) === realpathSync(fileURLToPath(importMetaUrl));
  } catch {
    return false;
  }
}

/** Run the example only when its file is the process entry point. */
export async function runIfMain(
  importMetaUrl: string,
  example: Example
): Promise<void> {
  if (!isEntry(importMetaUrl)) return;
  const argv = process.argv.slice(2);
  // `pnpm <script> -- <args>` forwards a literal `--`; strip it like the CLI.
  const args = argv[0] === "--" ? argv.slice(1) : argv;
  try {
    await runExample(example, args);
  } catch (error) {
    reportError(error);
    process.exitCode = 1;
  }
}

/** Clean error printing: known config errors show the message; others add a stack under DEBUG. */
export function reportError(error: unknown): void {
  if (
    error instanceof ExampleError ||
    error instanceof ProfileFieldError ||
    error instanceof ProfileValidationError
  ) {
    console.error(error.message);
  } else if (error instanceof Error) {
    console.error(`Error: ${error.message}`);
    if (process.env.DEBUG) console.error(error.stack);
  } else {
    console.error("Error:", error);
  }
}

/**
 * examples:check — offline verification of the examples workspace.
 *
 * Run via `pnpm examples:check`, which typechecks the workspace against the real
 * package exports (`tsc -p examples/tsconfig.json`) and then runs this script.
 * Together they guard the examples without a network or a keypair:
 *
 *   1. the registry has unique names, each entry points to a real module whose
 *      `default.name` matches, exports a `run`, and has a file that exists;
 *   2. transaction examples default to `print`, never `execute`;
 *   3. every example renders `--help` with no network access or keypair;
 *   4. examples whose builders run offline build a valid `BuiltOperation`
 *      (asserted with the shared shape check) against a fake RPC + signers;
 *   5. no example source contains hard-coded keypair material or absolute paths.
 *
 * Network-dependent runs (the Kamino reserve/kvault flows, a live Jupiter swap,
 * `--mode execute`) are intentionally NOT exercised here — run those manually.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { createFakeScriptContext, assertBuiltOperationShape } from "@voltr/scripts-core/testing";
import {
  generateKeyPairSigner,
  type BuiltOperation,
  type KeyPairSigner,
  type ScriptProfile,
} from "@voltr/scripts-core";
import { registry } from "../src/registry.js";
import {
  DEFAULT_MODE,
  renderHelp,
  runExample,
  type Harness,
  type Role,
} from "../src/shared/harness.js";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const EXAMPLES_SRC = join(REPO_ROOT, "examples", "src");

const VALID_GROUPS = new Set(["vault", "kamino", "spot", "trustful", "composition"]);
const VALID_ROLES = new Set(["admin", "manager", "user", "none"]);
const VALID_NETWORKS = new Set(["none", "rpc-read", "rpc-and-http"]);

// A fully-populated fixture profile so any offline builder's profile accessors
// resolve. Values are valid base58 placeholders; builders run against a fake RPC.
const FIXTURE_PROFILE = {
  name: "fixture",
  cluster: "mainnet-beta",
  vault: {
    assetMintAddress: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    assetTokenProgram: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
    vaultAddress: "So11111111111111111111111111111111111111112",
    useLookupTable: false,
  },
  integrations: {
    kamino: {
      reserveAddress: "So11111111111111111111111111111111111111112",
      kvaultAddress: "So11111111111111111111111111111111111111112",
      directWithdrawDiscriminator: [1, 2, 3, 4, 5, 6, 7, 8],
    },
    spot: {
      foreignMintAddress: "So11111111111111111111111111111111111111112",
      foreignTokenProgram: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
      assetOracleAddress: "ComputeBudget111111111111111111111111111111",
      foreignOracleAddress: "AddressLookupTab1e1111111111111111111111111",
      directWithdrawDiscriminator: [232, 204, 244, 40, 201, 192, 7, 194],
    },
    trustful: { strategySeedString: "example-strategy" },
  },
} as unknown as ScriptProfile;

const failures: string[] = [];
let smokeCount = 0;

async function check(label: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn();
    console.log(`  ok   ${label}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`  FAIL ${label}: ${message}`);
    failures.push(`${label}: ${message}`);
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function suppressOutput<T>(fn: () => Promise<T>): Promise<T> {
  const original = console.log;
  console.log = () => {};
  try {
    return await fn();
  } finally {
    console.log = original;
  }
}

function fakeHarness(collected: BuiltOperation[]): Harness {
  const ctx = createFakeScriptContext({ profile: FIXTURE_PROFILE });
  const signers = new Map<Role, KeyPairSigner>();
  return {
    profile: FIXTURE_PROFILE,
    ctx,
    mode: "print",
    async signer(role) {
      const cached = signers.get(role);
      if (cached) return cached;
      const signer = await generateKeyPairSigner();
      signers.set(role, signer);
      return signer;
    },
    async process(operation) {
      collected.push(operation);
    },
    heading: () => {},
    line: () => {},
    field: () => {},
    note: () => {},
    json: () => {},
  };
}

function listSourceFiles(): string[] {
  return readdirSync(EXAMPLES_SRC, { recursive: true })
    .map((entry) => entry.toString())
    .filter((entry) => entry.endsWith(".ts"))
    .map((entry) => join(EXAMPLES_SRC, entry));
}

const FORBIDDEN_PATTERNS: { label: string; pattern: RegExp }[] = [
  { label: "absolute home/dev path", pattern: /\/(?:Users|home|root)\// },
  { label: "Windows drive path", pattern: /[A-Za-z]:\\\\/ },
  { label: "secret key byte array (32+ numbers)", pattern: /\[(?:\s*\d{1,3}\s*,){31,}\s*\d{1,3}\s*\]/ },
  { label: "secret/private key identifier", pattern: /secretkey|privatekey/i },
];

async function main(): Promise<void> {
  console.log("examples:check\n");

  console.log("registry:");
  const seen = new Set<string>();
  for (const entry of registry) {
    await check(`load ${entry.name}`, async () => {
      assert(!seen.has(entry.name), `duplicate registry name "${entry.name}"`);
      seen.add(entry.name);
      assert(VALID_GROUPS.has(entry.group), `invalid group "${entry.group}"`);
      assert(VALID_ROLES.has(entry.role), `invalid role "${entry.role}"`);
      assert(VALID_NETWORKS.has(entry.network), `invalid network "${entry.network}"`);
      assert(entry.summary.length > 0, "empty summary");
      assert(existsSync(join(REPO_ROOT, entry.file)), `file does not exist: ${entry.file}`);
      const module = await entry.load();
      assert(module.default && typeof module.default.run === "function", "module default missing run()");
      assert(module.default.name === entry.name, `module name "${module.default.name}" != registry "${entry.name}"`);
    });
  }

  console.log("\nsafety:");
  await check("default mode is print", () => {
    assert(DEFAULT_MODE === "print", `DEFAULT_MODE is "${DEFAULT_MODE}", expected "print"`);
  });

  console.log("\nhelp (offline, no keypair):");
  for (const entry of registry) {
    await check(`${entry.name} --help`, async () => {
      const help = renderHelp(entry.name, entry);
      assert(help.includes("Usage:"), "help missing Usage");
      assert(help.includes(entry.name), "help missing example name");
      const module = await entry.load();
      await suppressOutput(() => runExample(module.default, ["--help"]));
    });
  }

  console.log("\nsmoke (offline builds):");
  for (const entry of registry) {
    if (!entry.offline) continue;
    smokeCount += 1;
    await check(`${entry.name} smoke`, async () => {
      const module = await entry.load();
      const collected: BuiltOperation[] = [];
      await module.default.run(fakeHarness(collected));
      assert(collected.length > 0, "no operation was processed");
      for (const operation of collected) assertBuiltOperationShape(operation);
    });
  }

  console.log("\nhygiene:");
  await check("no hard-coded secrets or absolute paths in examples/src", () => {
    for (const file of listSourceFiles()) {
      const content = readFileSync(file, "utf8");
      for (const { label, pattern } of FORBIDDEN_PATTERNS) {
        assert(!pattern.test(content), `${label} found in ${file}`);
      }
    }
  });

  console.log(
    `\n${failures.length === 0 ? "PASS" : "FAIL"} — ${registry.length} examples, ${smokeCount} smoke-tested, ${failures.length} failure(s).`
  );
  if (failures.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

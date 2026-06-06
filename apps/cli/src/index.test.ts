import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import type { Command } from "commander";
import { createProgram } from "./index.js";

const execFileAsync = promisify(execFile);

const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";

interface Harness {
  program: Command;
  output: () => string;
}

/**
 * Builds the program with `exitOverride` + captured output on the root and
 * every subcommand, so commander signals validation failures by throwing
 * (which `parseAsync` rejects with) instead of calling `process.exit`.
 */
function harness(): Harness {
  const program = createProgram();
  let out = "";
  const write = (chunk: string): boolean => {
    out += chunk;
    return true;
  };
  const configure = (command: Command): void => {
    command.exitOverride();
    command.configureOutput({ writeOut: write, writeErr: write });
  };
  configure(program);
  for (const sub of program.commands) configure(sub);
  return { program, output: () => out };
}

function parse(program: Command, args: string[]): Promise<unknown> {
  return program.parseAsync(args, { from: "user" });
}

async function withTempProfile(
  content: string,
  run: (path: string) => Promise<void>
): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "voltr-cli-"));
  const file = join(dir, "profile.json");
  await writeFile(file, content, "utf8");
  try {
    await run(file);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("--help lists the available commands", async () => {
  const { program, output } = harness();
  await assert.rejects(() => parse(program, ["--help"]));
  const text = output();
  assert.match(text, /Usage: voltr-scripts/);
  assert.match(text, /vault:deposit/);
  assert.match(text, /kamino:market:deposit/);
  assert.match(text, /spot:spot:buy/);
  assert.match(text, /trustful:curve:borrow/);
  assert.match(text, /check/);
});

test("rejects an invalid --mode choice", async () => {
  const { program } = harness();
  await assert.rejects(() =>
    parse(program, ["--profile", "p.json", "--mode", "bogus", "check"])
  );
});

test("rejects an invalid --priority-fee choice", async () => {
  const { program } = harness();
  await assert.rejects(() =>
    parse(program, ["--profile", "p.json", "--priority-fee", "bogus", "check"])
  );
});

test("rejects vault:deposit without the required --amount", async () => {
  const { program } = harness();
  await assert.rejects(() =>
    parse(program, [
      "--profile",
      "p.json",
      "vault:deposit",
      "--user-keypair",
      "/tmp/does-not-matter.json",
    ])
  );
});

test("vault:deposit surfaces a missing profile field before any network/keypair I/O", async () => {
  // Valid profile, but no vaultAddress -> requireVaultAddress should throw
  // before createScriptContext or the keypair file is ever touched.
  const profile = JSON.stringify({
    name: "cli-test",
    cluster: "devnet",
    rpcUrl: "http://localhost:8899",
    vault: { assetMintAddress: USDC, assetTokenProgram: TOKEN_PROGRAM },
  });

  await withTempProfile(profile, async (profilePath) => {
    const { program } = harness();
    await assert.rejects(
      () =>
        parse(program, [
          "--profile",
          profilePath,
          "--mode",
          "print",
          "vault:deposit",
          "--user-keypair",
          "/nonexistent/user.json",
          "--amount",
          "1000000",
        ]),
      /vault\.vaultAddress/
    );
  });
});

async function runCli(args: string[]): Promise<string> {
  const cliEntry = fileURLToPath(new URL("./index.ts", import.meta.url));
  const checkConfig = fileURLToPath(
    new URL("../../../tsconfig.check.json", import.meta.url)
  );
  const { stdout } = await execFileAsync(
    process.execPath,
    ["--import", "tsx", cliEntry, ...args],
    { env: { ...process.env, TSX_TSCONFIG_PATH: checkConfig }, encoding: "utf8" }
  );
  return stdout;
}

test("CLI entrypoint runs from source and prints help (subprocess smoke)", async () => {
  assert.match(await runCli(["--help"]), /vault:deposit/);
});

test("CLI tolerates the leading -- that pnpm forwards (`pnpm cli -- --help`)", async () => {
  assert.match(await runCli(["--", "--help"]), /vault:deposit/);
});

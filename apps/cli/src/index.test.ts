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
const SYSTEM = "11111111111111111111111111111111";

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

test("--help lists the full vault command surface", async () => {
  const { program, output } = harness();
  await assert.rejects(() => parse(program, ["--help"]));
  const text = output();
  for (const cmd of [
    "vault:init",
    "vault:init-and-set-token-metadata",
    "vault:set-token-metadata",
    "vault:update-config",
    "vault:accept-admin",
    "vault:harvest-fee",
    "vault:request-withdraw",
    "vault:cancel-request-withdraw",
    "vault:withdraw",
    "vault:instant-withdraw",
    "vault:query:position",
    "vault:query:strategy-positions",
  ]) {
    assert.ok(text.includes(cmd), `--help should list ${cmd}`);
  }
});

test("vault:init requires --manager, --name, and --max-cap", async () => {
  const incompleteFlagSets = [
    ["--name", "V", "--max-cap", "1"], // missing --manager
    ["--manager", USDC, "--max-cap", "1"], // missing --name
    ["--manager", USDC, "--name", "V"], // missing --max-cap
  ];
  for (const flags of incompleteFlagSets) {
    const { program } = harness();
    await assert.rejects(() =>
      parse(program, ["--profile", "p.json", "vault:init", ...flags])
    );
  }
});

test("vault:harvest-fee requires --manager", async () => {
  const { program } = harness();
  await assert.rejects(() =>
    parse(program, ["--profile", "p.json", "vault:harvest-fee"])
  );
});

test("vault:query:position requires --user", async () => {
  const { program } = harness();
  await assert.rejects(() =>
    parse(program, ["--profile", "p.json", "vault:query:position"])
  );
});

test("vault:request-withdraw requires --amount", async () => {
  const { program } = harness();
  await assert.rejects(() =>
    parse(program, ["--profile", "p.json", "vault:request-withdraw"])
  );
});

test("vault:withdraw surfaces a missing profile field before any network/keypair I/O", async () => {
  // Valid profile without vaultAddress -> requireVaultAddress should throw
  // before createScriptContext dials anything or the keypair file is touched.
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
          "vault:withdraw",
          "--user-keypair",
          "/nonexistent/user.json",
        ]),
      /vault\.vaultAddress/
    );
  });
});

test("vault:update-config rejects an unknown --field before loading a keypair", async () => {
  const profile = JSON.stringify({
    name: "cli-test",
    cluster: "devnet",
    rpcUrl: "http://localhost:8899",
    vault: {
      assetMintAddress: USDC,
      assetTokenProgram: TOKEN_PROGRAM,
      vaultAddress: SYSTEM,
    },
  });

  await withTempProfile(profile, async (profilePath) => {
    const { program } = harness();
    await assert.rejects(
      () =>
        parse(program, [
          "--profile",
          profilePath,
          "vault:update-config",
          "--field",
          "bogus-field",
          "--value",
          "1",
        ]),
      /Unknown vault config field/
    );
  });
});

test("vault:update-config rejects an out-of-range u16 --value", async () => {
  const profile = JSON.stringify({
    name: "cli-test",
    cluster: "devnet",
    rpcUrl: "http://localhost:8899",
    vault: {
      assetMintAddress: USDC,
      assetTokenProgram: TOKEN_PROGRAM,
      vaultAddress: SYSTEM,
    },
  });

  await withTempProfile(profile, async (profilePath) => {
    const { program } = harness();
    await assert.rejects(
      () =>
        parse(program, [
          "--profile",
          profilePath,
          "vault:update-config",
          "--field",
          "redemption-fee",
          "--value",
          "70000",
        ]),
      /u16/
    );
  });
});

test("vault:init rejects a non-numeric --max-cap", async () => {
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
          "vault:init",
          "--manager",
          USDC,
          "--name",
          "V",
          "--max-cap",
          "abc",
        ]),
      /max-cap must be/
    );
  });
});

test("vault:init* reject --mode multisig even when fully specified", async () => {
  // The init commands generate an ephemeral vault keypair that must sign; a
  // multisig payload (no signatures, placeholder blockhash) can never carry that
  // signature, so the mode is rejected before a throwaway keypair is generated —
  // even with a valid --multisig-address present.
  const profile = JSON.stringify({
    name: "cli-test",
    cluster: "devnet",
    rpcUrl: "http://localhost:8899",
    vault: { assetMintAddress: USDC, assetTokenProgram: TOKEN_PROGRAM },
  });
  const invocations = [
    ["vault:init", "--manager", USDC, "--name", "V", "--max-cap", "1"],
    [
      "vault:init-and-set-token-metadata",
      "--manager",
      USDC,
      "--name",
      "V",
      "--max-cap",
      "1",
      "--metadata-name",
      "LP",
      "--metadata-symbol",
      "LP",
      "--metadata-uri",
      "https://example.com/lp.json",
    ],
  ];

  await withTempProfile(profile, async (profilePath) => {
    for (const invocation of invocations) {
      const { program } = harness();
      await assert.rejects(
        () =>
          parse(program, [
            "--profile",
            profilePath,
            "--mode",
            "multisig",
            "--multisig-address",
            SYSTEM,
            ...invocation,
          ]),
        /does not support --mode multisig/
      );
    }
  });
});

test("--help lists the full trustful + adaptor-admin command surface", async () => {
  const { program, output } = harness();
  await assert.rejects(() => parse(program, ["--help"]));
  const text = output();
  for (const cmd of [
    "vault:add-adaptor",
    "vault:remove-adaptor",
    "trustful:arbitrary:init",
    "trustful:arbitrary:deposit",
    "trustful:arbitrary:withdraw",
    "trustful:curve:init",
    "trustful:curve:borrow",
    "trustful:curve:repay",
    "trustful:curve:remove",
  ]) {
    assert.ok(text.includes(cmd), `--help should list ${cmd}`);
  }
});

test("vault:add-adaptor and vault:remove-adaptor require --adaptor-program", async () => {
  for (const cmd of ["vault:add-adaptor", "vault:remove-adaptor"]) {
    const { program } = harness();
    await assert.rejects(
      () => parse(program, ["--profile", "p.json", cmd]),
      /adaptor-program/
    );
  }
});

test("trustful:arbitrary:withdraw requires --amount and --position-value-after", async () => {
  const incompleteFlagSets = [
    ["--position-value-after", "1"], // missing --amount
    ["--amount", "1"], // missing --position-value-after
  ];
  for (const flags of incompleteFlagSets) {
    const { program } = harness();
    await assert.rejects(() =>
      parse(program, [
        "--profile",
        "p.json",
        "trustful:arbitrary:withdraw",
        ...flags,
      ])
    );
  }
});

test("trustful:arbitrary:init surfaces a missing trustful section before any network/keypair I/O", async () => {
  // vaultAddress is set, but integrations.trustful is absent -> the strategy
  // seed accessor should throw before createScriptContext dials or the keypair
  // file is touched.
  const profile = JSON.stringify({
    name: "cli-test",
    cluster: "devnet",
    rpcUrl: "http://localhost:8899",
    vault: {
      assetMintAddress: USDC,
      assetTokenProgram: TOKEN_PROGRAM,
      vaultAddress: SYSTEM,
    },
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
          "trustful:arbitrary:init",
          "--manager-keypair",
          "/nonexistent/manager.json",
        ]),
      /integrations\.trustful/
    );
  });
});

test("trustful:curve:remove surfaces a missing profile field before any network/keypair I/O", async () => {
  // No vaultAddress -> requireVaultAddress should throw before the curve seed is
  // derived, the RPC is dialed, or the keypair file is read.
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
          "trustful:curve:remove",
          "--manager-keypair",
          "/nonexistent/manager.json",
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

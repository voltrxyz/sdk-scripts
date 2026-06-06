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
  assert.match(text, /spot:swap:buy/);
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
    "vault:add-adaptor",
    "vault:remove-adaptor",
    "vault:init-direct-withdraw",
    "vault:query:position",
    "vault:query:strategy-positions",
  ]) {
    assert.ok(text.includes(cmd), `--help should list ${cmd}`);
  }
});

test("--help lists the full Kamino command surface and claim flags", async () => {
  const { program, output } = harness();
  await assert.rejects(() => parse(program, ["--help"]));
  const rootHelp = output();
  for (const cmd of [
    "kamino:market:init",
    "kamino:market:deposit",
    "kamino:market:withdraw",
    "kamino:market:claim-reward",
    "kamino:market:claim-reward-with-index",
    "kamino:kvault:init",
    "kamino:kvault:deposit",
    "kamino:kvault:withdraw",
    "kamino:kvault:claim-reward",
    "kamino:kvault:claim-reward-with-index",
    "kamino:kvault:direct-withdraw",
    "kamino:kvault:request-and-direct-withdraw",
  ]) {
    assert.ok(rootHelp.includes(cmd), `--help should list ${cmd}`);
  }

  const claim = harness();
  await assert.rejects(() =>
    parse(claim.program, ["kamino:market:claim-reward-with-index", "--help"])
  );
  const claimHelp = claim.output();
  for (const flag of [
    "--reward-mint",
    "--farm-state",
    "--user-state",
    "--reward-index",
    "--swap-amount",
  ]) {
    assert.ok(claimHelp.includes(flag), `claim help should list ${flag}`);
  }

  const directWithdraw = harness();
  await assert.rejects(() =>
    parse(directWithdraw.program, ["vault:init-direct-withdraw", "--help"])
  );
  assert.match(directWithdraw.output(), /--discriminator/);
  assert.match(
    directWithdraw.output(),
    /integrations\.kamino\.directWithdrawDiscriminator/
  );
});

test("--help lists the full spot command surface", async () => {
  const { program, output } = harness();
  await assert.rejects(() => parse(program, ["--help"]));
  const text = output();
  for (const cmd of [
    "spot:swap:init",
    "spot:swap:buy",
    "spot:swap:sell",
    "spot:earn:init",
    "spot:earn:deposit",
    "spot:earn:withdraw",
    "spot:earn:extend-lut",
    "spot:earn:init-direct-withdraw",
    "spot:query:strategy-positions",
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

test("vault:init-direct-withdraw requires an explicit discriminator for adaptor overrides", async () => {
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
          "vault:init-direct-withdraw",
          "--adaptor-program",
          USDC,
          "--strategy",
          SYSTEM,
        ]),
      /requires --discriminator/
    );
  });
});

test("spot:earn:deposit requires --amount", async () => {
  const { program } = harness();
  await assert.rejects(() =>
    parse(program, ["--profile", "p.json", "spot:earn:deposit"])
  );
});

test("spot:swap:buy requires --slippage-bps", async () => {
  const { program } = harness();
  await assert.rejects(() =>
    parse(program, [
      "--profile",
      "p.json",
      "spot:swap:buy",
      "--amount",
      "1000000",
    ])
  );
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

test("vault:init-direct-withdraw rejects a malformed --discriminator", async () => {
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
          "vault:init-direct-withdraw",
          "--admin-keypair",
          "/nonexistent/admin.json",
          "--strategy",
          USDC,
          "--adaptor-program",
          USDC,
          "--discriminator",
          "1,2,3", // not 8 bytes
        ]),
      /--discriminator must be 8/
    );
  });
});

test("vault:init-direct-withdraw accepts explicit discriminator without Kamino profile fields", async () => {
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
          "vault:init-direct-withdraw",
          "--admin-keypair",
          "/nonexistent/admin.json",
          "--adaptor-program",
          USDC,
          "--strategy",
          SYSTEM,
          "--discriminator",
          "1,2,3,4,5,6,7,8",
        ]),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.doesNotMatch(
          error.message,
          /integrations\.kamino\.directWithdrawDiscriminator/
        );
        assert.match(error.message, /keypair|ENOENT|no such file/i);
        return true;
      }
    );
  });
});

test("spot:earn:init-direct-withdraw surfaces a missing discriminator profile field", async () => {
  // Valid profile with a vault and a spot section, but no directWithdrawDiscriminator
  // -> requireSpotDirectWithdrawDiscriminator should name the missing field before
  // createScriptContext dials anything or the keypair file is touched.
  const profile = JSON.stringify({
    name: "cli-test",
    cluster: "devnet",
    rpcUrl: "http://localhost:8899",
    vault: {
      assetMintAddress: USDC,
      assetTokenProgram: TOKEN_PROGRAM,
      vaultAddress: SYSTEM,
    },
    integrations: { spot: {} },
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
          "spot:earn:init-direct-withdraw",
          "--admin-keypair",
          "/nonexistent/admin.json",
        ]),
      /directWithdrawDiscriminator/
    );
  });
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

// --- shared flag parser coverage (per integration group) ---
//
// parse.test.ts unit-tests every shared parser directly; these assert each
// integration group surfaces an actionable CliError (naming the flag) when an
// amount / bps / count / index / address flag is malformed — reached after
// profile + field validation but before any keypair or network I/O.

const VAULT_ONLY_PROFILE = JSON.stringify({
  name: "cli-test",
  cluster: "devnet",
  rpcUrl: "http://localhost:8899",
  vault: {
    assetMintAddress: USDC,
    assetTokenProgram: TOKEN_PROGRAM,
    vaultAddress: SYSTEM,
  },
});

const KAMINO_PROFILE = JSON.stringify({
  name: "cli-test",
  cluster: "devnet",
  rpcUrl: "http://localhost:8899",
  vault: {
    assetMintAddress: USDC,
    assetTokenProgram: TOKEN_PROGRAM,
    vaultAddress: SYSTEM,
  },
  integrations: { kamino: { reserveAddress: USDC, kvaultAddress: USDC } },
});

const SPOT_PROFILE = JSON.stringify({
  name: "cli-test",
  cluster: "devnet",
  rpcUrl: "http://localhost:8899",
  vault: {
    assetMintAddress: USDC,
    assetTokenProgram: TOKEN_PROGRAM,
    vaultAddress: SYSTEM,
  },
  integrations: {
    spot: {
      foreignMintAddress: SYSTEM,
      foreignTokenProgram: TOKEN_PROGRAM,
      assetOracleAddress: USDC,
      foreignOracleAddress: SYSTEM,
    },
  },
});

const TRUSTFUL_PROFILE = JSON.stringify({
  name: "cli-test",
  cluster: "devnet",
  rpcUrl: "http://localhost:8899",
  vault: {
    assetMintAddress: USDC,
    assetTokenProgram: TOKEN_PROGRAM,
    vaultAddress: SYSTEM,
  },
  integrations: { trustful: { strategySeedString: "demo" } },
});

test("kamino:market:deposit rejects a non-integer --amount", async () => {
  await withTempProfile(KAMINO_PROFILE, async (profilePath) => {
    const { program } = harness();
    await assert.rejects(
      () =>
        parse(program, [
          "--profile",
          profilePath,
          "kamino:market:deposit",
          "--amount",
          "abc",
        ]),
      /--amount must be a non-negative integer/
    );
  });
});

test("kamino:kvault:claim-reward-with-index rejects a non-integer --reward-index", async () => {
  await withTempProfile(KAMINO_PROFILE, async (profilePath) => {
    const { program } = harness();
    await assert.rejects(
      () =>
        parse(program, [
          "--profile",
          profilePath,
          "kamino:kvault:claim-reward-with-index",
          "--reward-mint",
          USDC,
          "--farm-state",
          SYSTEM,
          "--user-state",
          SYSTEM,
          "--reward-index",
          "abc",
        ]),
      /--reward-index must be a non-negative integer/
    );
  });
});

test("spot:swap:buy rejects an out-of-range --slippage-bps", async () => {
  await withTempProfile(SPOT_PROFILE, async (profilePath) => {
    const { program } = harness();
    await assert.rejects(
      () =>
        parse(program, [
          "--profile",
          profilePath,
          "spot:swap:buy",
          "--amount",
          "1000000",
          "--slippage-bps",
          "99999",
        ]),
      /--slippage-bps must be an integer between 0 and 10000/
    );
  });
});

test("spot:swap:buy rejects a zero --jupiter-max-accounts", async () => {
  await withTempProfile(SPOT_PROFILE, async (profilePath) => {
    const { program } = harness();
    await assert.rejects(
      () =>
        parse(program, [
          "--profile",
          profilePath,
          "spot:swap:buy",
          "--amount",
          "1000000",
          "--slippage-bps",
          "50",
          "--jupiter-max-accounts",
          "0",
        ]),
      /--jupiter-max-accounts must be a positive integer/
    );
  });
});

test("trustful:curve:borrow rejects an out-of-range --borrow-rate-bps", async () => {
  await withTempProfile(VAULT_ONLY_PROFILE, async (profilePath) => {
    const { program } = harness();
    await assert.rejects(
      () =>
        parse(program, [
          "--profile",
          profilePath,
          "trustful:curve:borrow",
          "--amount",
          "1",
          "--borrow-rate-bps",
          "99999",
        ]),
      /--borrow-rate-bps must be an integer between 0 and 10000/
    );
  });
});

test("trustful:arbitrary:deposit rejects a malformed --destination address", async () => {
  await withTempProfile(TRUSTFUL_PROFILE, async (profilePath) => {
    const { program } = harness();
    await assert.rejects(
      () =>
        parse(program, [
          "--profile",
          profilePath,
          "trustful:arbitrary:deposit",
          "--amount",
          "1",
          "--destination",
          "not-an-address",
          "--position-value-after",
          "1",
        ]),
      /--destination must be a valid base58 Solana address/
    );
  });
});

test("vault:harvest-fee rejects a malformed --manager address", async () => {
  await withTempProfile(VAULT_ONLY_PROFILE, async (profilePath) => {
    const { program } = harness();
    await assert.rejects(
      () =>
        parse(program, [
          "--profile",
          profilePath,
          "vault:harvest-fee",
          "--manager",
          "not-an-address",
        ]),
      /--manager must be a valid base58 Solana address/
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

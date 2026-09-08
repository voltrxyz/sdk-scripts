import assert from "node:assert/strict";
import { test } from "node:test";
import { createProgram } from "../index.js";
import { ScriptProfileSchema, requireNeutralBundle } from "@voltr/scripts-core";

function program() {
  const cli = createProgram();
  for (const command of [cli, ...cli.commands]) {
    command.exitOverride();
    command.configureOutput({ writeOut() {}, writeErr() {} });
  }
  return cli;
}

test("Neutral exposes separate request and claim operations and a signer-free query", async () => {
  const cli = program();
  const actions = [
    "init",
    "register-depositor",
    "deposit",
    "refresh",
    "request-withdraw",
    "claim",
    "query:status",
  ];
  for (const action of actions)
    assert.ok(
      cli.commands.some(
        (command) => command.name() === `neutral:bundle:${action}`
      )
    );
  const claim = cli.commands.find(
    (command) => command.name() === "neutral:bundle:claim"
  )!;
  assert.equal(
    claim.options.some((option) => option.long === "--amount"),
    false
  );
  const status = cli.commands.find(
    (command) => command.name() === "neutral:bundle:query:status"
  )!;
  assert.equal(
    status.options.some((option) => option.long?.includes("keypair")),
    false
  );
  for (const flags of [
    [],
    ["--all", "--amount", "1"],
    ["--amount", "0"],
    ["--amount", "18446744073709551616"],
    ["--amount", "1.5"],
  ]) {
    await assert.rejects(
      program().parseAsync(["neutral:bundle:request-withdraw", ...flags], {
        from: "user",
      }),
      /either|cannot|amount|integer/
    );
  }
});

test("Neutral profile validates bundle addresses and reports a missing bundle field", () => {
  const profile = {
    name: "neutral-test",
    cluster: "mainnet-beta",
    vault: {
      assetMintAddress: "So11111111111111111111111111111111111111112",
      assetTokenProgram: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
    },
    integrations: {
      neutral: { bundleAddress: "So11111111111111111111111111111111111111112" },
    },
  };
  assert.equal(
    requireNeutralBundle(ScriptProfileSchema.parse(profile)),
    profile.integrations.neutral.bundleAddress
  );
  assert.throws(
    () =>
      requireNeutralBundle(
        ScriptProfileSchema.parse({
          ...profile,
          integrations: { neutral: { bundleAddress: "" } },
        })
      ),
    /integrations.neutral.bundleAddress/
  );
  assert.equal(
    ScriptProfileSchema.safeParse({
      ...profile,
      integrations: { neutral: { bundleAddress: "invalid" } },
    }).success,
    false
  );
});

#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import { registerCheckCommand } from "./commands/check.js";
import { registerKaminoCommands } from "./commands/kamino.js";
import { registerSpotCommands } from "./commands/spot.js";
import { registerTrustfulCommands } from "./commands/trustful.js";
import { registerVaultCommands } from "./commands/vault.js";
import { reportError } from "./lib/errors.js";
import { addGlobalOptions } from "./lib/globals.js";

/**
 * Builds the commander program. Exported so tests can exercise argument
 * validation in-process without parsing at module import time.
 */
export function createProgram(): Command {
  const program = new Command()
    .name("voltr-scripts")
    .description(
      [
        "Voltr vault and integration operations.",
        "",
        "Command groups:",
        "  vault:*     shared Voltr vault operations",
        "  kamino:*    Kamino market / kvault strategies",
        "  spot:*      Spot / Earn strategies",
        "  trustful:*  Trustful arbitrary / curve strategies",
        "",
        "Run any command with --help to see its flags, e.g. `vault:deposit --help`.",
      ].join("\n")
    )
    .showHelpAfterError("(run with --help for usage)");

  addGlobalOptions(program);

  // Each group registers its own commands so this entry point stays small and
  // new modules can be added with a single import + register call.
  registerVaultCommands(program);
  registerKaminoCommands(program);
  registerSpotCommands(program);
  registerTrustfulCommands(program);
  registerCheckCommand(program);

  program.addHelpText(
    "after",
    [
      "",
      "Examples:",
      "  $ voltr-scripts --profile configs/my-vault.json check",
      "  $ voltr-scripts --profile configs/my-vault.json --mode print vault:deposit --amount 1000000",
      "  $ voltr-scripts --profile configs/my-vault.json --mode simulate kamino:market:deposit --amount 1000000",
      "",
      "Run via pnpm with a leading `--`:",
      "  $ pnpm cli -- --profile configs/my-vault.json --mode print vault:deposit --amount 1000000",
    ].join("\n")
  );

  return program;
}

function isMainModule(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return realpathSync(entry) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isMainModule()) {
  // When invoked as `pnpm cli -- <args>`, pnpm forwards a literal `--` as the
  // first argument. Strip it so commander does not treat the real flags that
  // follow as positional operands.
  const argv = process.argv.slice(2);
  const args = argv[0] === "--" ? argv.slice(1) : argv;
  createProgram().parseAsync(args, { from: "user" }).catch(reportError);
}

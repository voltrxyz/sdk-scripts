#!/usr/bin/env node
/**
 * Convenience dispatcher behind `pnpm example` and `pnpm examples:list`.
 *
 *   pnpm examples:list                         # catalog of every example
 *   pnpm example -- <name> [flags]             # run one example by name
 *   pnpm example -- <name> --help              # help for one example
 *
 * This is only a catalog/dispatcher: it loads the named example's module and
 * calls the same `runExample` the file runs when executed directly with
 * `pnpm exec tsx examples/src/<group>/<file>.ts`. It is never the only way to run
 * an example.
 */
import { findEntry, registry, type RegistryEntry } from "./registry.js";
import { reportError, ROLE_ENV_VAR, runExample, type Role } from "./shared/harness.js";
import { line } from "./shared/output.js";
import { ExampleError } from "./shared/harness.js";

function networkLabel(network: RegistryEntry["network"]): string {
  switch (network) {
    case "none":
      return "offline";
    case "rpc-read":
      return "rpc";
    case "rpc-and-http":
      return "rpc+http";
  }
}

function roleLabel(entry: RegistryEntry): string {
  return entry.role === "none" ? "read-only" : `${entry.role} (${ROLE_ENV_VAR[entry.role as Role]})`;
}

function printList(): void {
  line("Voltr sdk-scripts — programmatic examples\n");
  line("Run one with (config via env or flags; print mode by default):");
  line("  pnpm example -- <name>");
  line("  pnpm exec tsx <file>\n");

  const sorted = [...registry].sort(
    (a, b) => a.group.localeCompare(b.group) || a.name.localeCompare(b.name)
  );
  let group = "";
  for (const entry of sorted) {
    if (entry.group !== group) {
      group = entry.group;
      line(`${group}:`);
    }
    line(`  ${entry.name.padEnd(40)}${entry.summary}`);
    line(`  ${"".padEnd(40)}role: ${roleLabel(entry)} · network: ${networkLabel(entry.network)}`);
  }
}

function printUsage(): void {
  line("Usage:");
  line("  pnpm examples:list");
  line("  pnpm example -- <name> [flags]");
  line("  pnpm example -- <name> --help");
  line("\nRun `pnpm examples:list` to see every example name.");
}

async function main(): Promise<void> {
  const raw = process.argv.slice(2);
  // `pnpm example -- <args>` forwards a literal `--`; strip it like the CLI.
  const argv = raw[0] === "--" ? raw.slice(1) : raw;

  const command = argv[0];
  if (!command || command === "list" || command === "--list") {
    printList();
    return;
  }
  if (command === "help" || command === "-h" || command === "--help") {
    printUsage();
    return;
  }

  const entry = findEntry(command);
  if (!entry) {
    reportError(
      new ExampleError(
        `Unknown example "${command}". Run \`pnpm examples:list\` to see available examples.`
      )
    );
    process.exitCode = 1;
    return;
  }

  const module = await entry.load();
  await runExample(module.default, argv.slice(1));
}

main().catch((error) => {
  reportError(error);
  process.exitCode = 1;
});

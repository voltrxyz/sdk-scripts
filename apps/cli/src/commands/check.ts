import type { Command } from "commander";
import { loadProfile, type ScriptProfile } from "@voltr/scripts-core";
import type { GlobalOptions } from "../lib/globals.js";
import { presence, printField, printLine } from "../lib/output.js";

function summarizeIntegrations(profile: ScriptProfile): void {
  const integrations = profile.integrations ?? {};

  printField(
    "kamino",
    integrations.kamino
      ? `reserve ${presence(integrations.kamino.reserveAddress)}, kvault ${presence(integrations.kamino.kvaultAddress)}`
      : "(not configured)"
  );
  printField(
    "spot",
    integrations.spot
      ? `foreignMint ${presence(integrations.spot.foreignMintAddress)}, assetOracle ${presence(integrations.spot.assetOracleAddress)}`
      : "(not configured)"
  );
  printField(
    "trustful",
    integrations.trustful
      ? `strategySeed ${integrations.trustful.strategySeedString ? "set" : "(not set)"}`
      : "(not configured)"
  );
}

/**
 * `check` — validate the `--profile` file and print which addresses and
 * integrations are configured, without touching the network. Useful before a
 * run to confirm a freshly-edited profile has the fields a command will need.
 */
export function registerCheckCommand(program: Command): void {
  program
    .command("check")
    .summary("validate the --profile file and print a configuration summary")
    .description(
      "Load and validate the JSON profile named by --profile and print a summary of which vault fields and integrations are configured. Does not read the network."
    )
    .action(async () => {
      const globals = program.opts<GlobalOptions>();
      const profile = await loadProfile(globals.profile);

      printLine(`Profile: ${profile.name} (${profile.cluster})`);
      printLine("vault:");
      printField("assetMintAddress", presence(profile.vault.assetMintAddress));
      printField(
        "assetTokenProgram",
        presence(profile.vault.assetTokenProgram)
      );
      printField("vaultAddress", presence(profile.vault.vaultAddress));
      printField(
        "lookupTable",
        profile.vault.useLookupTable
          ? presence(profile.vault.lookupTableAddress)
          : "(disabled)"
      );
      printLine("integrations:");
      summarizeIntegrations(profile);
    });
}

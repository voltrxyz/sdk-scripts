import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ScriptProfileSchema,
  ProfileFieldError,
  ProfileValidationError,
  loadProfile,
  requireAssetMint,
  requireAssetTokenProgram,
  requireVaultAddress,
  requireLookupTableAddress,
  resolveLookupTableAddresses,
  requireKaminoIntegration,
  requireKaminoDirectWithdrawDiscriminator,
  requireSpotIntegration,
  requireSpotDirectWithdrawDiscriminator,
  requireTrustfulIntegration,
  type ScriptProfile,
} from "./profile.js";

// Valid base58 addresses (real program/mint ids). Only their validity matters
// to the schema; semantics are irrelevant for these tests.
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const WSOL = "So11111111111111111111111111111111111111112";
const SYSTEM = "11111111111111111111111111111111";
const COMPUTE_BUDGET = "ComputeBudget111111111111111111111111111111";
const TOKEN_2022 = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";

function baseProfile(overrides: Partial<ScriptProfile> = {}): ScriptProfile {
  return {
    name: "test-profile",
    cluster: "devnet",
    vault: {
      assetMintAddress: USDC,
      assetTokenProgram: TOKEN_PROGRAM,
    },
    ...overrides,
  };
}

async function withTempProfile(
  content: string,
  run: (path: string) => Promise<void>
): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), "voltr-profile-"));
  const file = join(dir, "profile.json");
  await writeFile(file, content, "utf8");
  try {
    await run(file);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

// --- Schema validation (no file I/O) ---

test("ScriptProfileSchema accepts a minimal valid profile", () => {
  const result = ScriptProfileSchema.safeParse({
    name: "ok",
    cluster: "mainnet-beta",
    vault: { assetMintAddress: USDC, assetTokenProgram: TOKEN_PROGRAM },
  });
  assert.equal(result.success, true);
});

test("ScriptProfileSchema rejects an empty name", () => {
  const result = ScriptProfileSchema.safeParse({
    name: "",
    cluster: "devnet",
    vault: { assetMintAddress: USDC, assetTokenProgram: TOKEN_PROGRAM },
  });
  assert.equal(result.success, false);
});

test("ScriptProfileSchema rejects an unknown cluster", () => {
  const result = ScriptProfileSchema.safeParse({
    name: "ok",
    cluster: "testnet",
    vault: { assetMintAddress: USDC, assetTokenProgram: TOKEN_PROGRAM },
  });
  assert.equal(result.success, false);
});

test("ScriptProfileSchema rejects unknown top-level keys (strict)", () => {
  const result = ScriptProfileSchema.safeParse({
    name: "ok",
    cluster: "devnet",
    vault: { assetMintAddress: USDC, assetTokenProgram: TOKEN_PROGRAM },
    surprise: true,
  });
  assert.equal(result.success, false);
});

test("ScriptProfileSchema rejects an invalid base58 asset mint", () => {
  const result = ScriptProfileSchema.safeParse({
    name: "ok",
    cluster: "devnet",
    vault: { assetMintAddress: "not-base58!", assetTokenProgram: TOKEN_PROGRAM },
  });
  assert.equal(result.success, false);
  if (result.success) return;
  assert.ok(
    result.error.issues.some((i) => i.path.join(".") === "vault.assetMintAddress")
  );
});

test("ScriptProfileSchema treats empty-string optional addresses as absent", () => {
  const result = ScriptProfileSchema.safeParse({
    name: "ok",
    cluster: "devnet",
    vault: {
      assetMintAddress: USDC,
      assetTokenProgram: TOKEN_PROGRAM,
      vaultAddress: "",
      lookupTableAddress: "",
    },
  });
  assert.equal(result.success, true);
  if (!result.success) return;
  assert.equal(result.data.vault.vaultAddress, undefined);
  assert.equal(result.data.vault.lookupTableAddress, undefined);
});

// --- loadProfile (file I/O, offline) ---

test("loadProfile parses a valid profile file", async () => {
  await withTempProfile(
    JSON.stringify(baseProfile({ name: "from-disk" })),
    async (path) => {
      const profile = await loadProfile(path);
      assert.equal(profile.name, "from-disk");
      assert.equal(profile.cluster, "devnet");
      assert.equal(profile.vault.assetMintAddress, USDC);
    }
  );
});

test("loadProfile rejects malformed JSON", async () => {
  await withTempProfile("{ not json", async (path) => {
    await assert.rejects(() => loadProfile(path), /not valid JSON/);
  });
});

test("loadProfile rejects a missing file", async () => {
  await assert.rejects(
    () => loadProfile(join(tmpdir(), "voltr-does-not-exist-12345.json")),
    /Failed to read profile/
  );
});

test("loadProfile throws ProfileValidationError naming the bad field", async () => {
  await withTempProfile(
    JSON.stringify({
      name: "bad",
      cluster: "devnet",
      vault: { assetMintAddress: "nope", assetTokenProgram: TOKEN_PROGRAM },
    }),
    async (path) => {
      await assert.rejects(loadProfile(path), (error: unknown) => {
        assert.ok(error instanceof ProfileValidationError);
        assert.match(error.message, /vault\.assetMintAddress/);
        return true;
      });
    }
  );
});

// --- Per-command accessors ---

test("requireAssetMint / requireAssetTokenProgram return the addresses", () => {
  const profile = baseProfile();
  assert.equal(requireAssetMint(profile), USDC);
  assert.equal(requireAssetTokenProgram(profile), TOKEN_PROGRAM);
});

test("requireVaultAddress returns the address when present", () => {
  const profile = baseProfile({
    vault: {
      assetMintAddress: USDC,
      assetTokenProgram: TOKEN_PROGRAM,
      vaultAddress: SYSTEM,
    },
  });
  assert.equal(requireVaultAddress(profile), SYSTEM);
});

test("requireVaultAddress throws ProfileFieldError naming the field + command", () => {
  const profile = baseProfile();
  assert.throws(
    () => requireVaultAddress(profile, { command: "vault:deposit" }),
    (error: unknown) => {
      assert.ok(error instanceof ProfileFieldError);
      assert.equal(error.field, "vault.vaultAddress");
      assert.match(error.message, /vault\.vaultAddress/);
      assert.match(error.message, /vault:deposit/);
      return true;
    }
  );
});

test("requireLookupTableAddress throws with a remediation hint", () => {
  const profile = baseProfile();
  assert.throws(
    () => requireLookupTableAddress(profile),
    (error: unknown) => {
      assert.ok(error instanceof ProfileFieldError);
      assert.equal(error.field, "vault.lookupTableAddress");
      assert.match(error.message, /useLookupTable/);
      return true;
    }
  );
});

test("resolveLookupTableAddresses returns [] when useLookupTable is off", () => {
  const profile = baseProfile();
  assert.deepEqual(resolveLookupTableAddresses(profile), []);
});

test("resolveLookupTableAddresses returns the LUT when enabled", () => {
  const profile = baseProfile({
    vault: {
      assetMintAddress: USDC,
      assetTokenProgram: TOKEN_PROGRAM,
      useLookupTable: true,
      lookupTableAddress: COMPUTE_BUDGET,
    },
  });
  assert.deepEqual(resolveLookupTableAddresses(profile), [COMPUTE_BUDGET]);
});

test("resolveLookupTableAddresses throws when enabled but address missing", () => {
  const profile = baseProfile({
    vault: {
      assetMintAddress: USDC,
      assetTokenProgram: TOKEN_PROGRAM,
      useLookupTable: true,
    },
  });
  assert.throws(
    () => resolveLookupTableAddresses(profile),
    (error: unknown) => error instanceof ProfileFieldError
  );
});

test("requireKaminoIntegration validates each field", () => {
  const missingSection = baseProfile();
  assert.throws(
    () => requireKaminoIntegration(missingSection),
    /integrations\.kamino/
  );

  const partial = baseProfile({
    integrations: { kamino: { reserveAddress: WSOL } },
  });
  assert.throws(
    () => requireKaminoIntegration(partial),
    /integrations\.kamino\.kvaultAddress/
  );

  const full = baseProfile({
    integrations: { kamino: { reserveAddress: WSOL, kvaultAddress: USDC } },
  });
  assert.deepEqual(requireKaminoIntegration(full), {
    reserve: WSOL,
    kvault: USDC,
  });
});

test("ScriptProfileSchema treats an empty directWithdrawDiscriminator as absent", () => {
  const result = ScriptProfileSchema.safeParse({
    name: "ok",
    cluster: "devnet",
    vault: { assetMintAddress: USDC, assetTokenProgram: TOKEN_PROGRAM },
    integrations: { kamino: { kvaultAddress: USDC, directWithdrawDiscriminator: [] } },
  });
  assert.equal(result.success, true);
  if (!result.success) return;
  assert.equal(
    result.data.integrations?.kamino?.directWithdrawDiscriminator,
    undefined
  );
});

test("ScriptProfileSchema rejects a directWithdrawDiscriminator that is not 8 bytes", () => {
  const result = ScriptProfileSchema.safeParse({
    name: "ok",
    cluster: "devnet",
    vault: { assetMintAddress: USDC, assetTokenProgram: TOKEN_PROGRAM },
    integrations: { kamino: { directWithdrawDiscriminator: [1, 2, 3] } },
  });
  assert.equal(result.success, false);
});

test("requireKaminoDirectWithdrawDiscriminator validates presence and returns the bytes", () => {
  assert.throws(
    () => requireKaminoDirectWithdrawDiscriminator(baseProfile()),
    /integrations\.kamino/
  );

  const missingField = baseProfile({
    integrations: { kamino: { kvaultAddress: USDC } },
  });
  assert.throws(
    () => requireKaminoDirectWithdrawDiscriminator(missingField),
    /integrations\.kamino\.directWithdrawDiscriminator/
  );

  const bytes = [135, 7, 237, 120, 149, 94, 95, 7];
  const full = baseProfile({
    integrations: {
      kamino: { kvaultAddress: USDC, directWithdrawDiscriminator: bytes },
    },
  });
  assert.deepEqual(requireKaminoDirectWithdrawDiscriminator(full), bytes);
});

test("requireSpotIntegration validates each field", () => {
  assert.throws(
    () => requireSpotIntegration(baseProfile()),
    /integrations\.spot/
  );

  const full = baseProfile({
    integrations: {
      spot: {
        foreignMintAddress: WSOL,
        foreignTokenProgram: TOKEN_2022,
        assetOracleAddress: SYSTEM,
        foreignOracleAddress: COMPUTE_BUDGET,
      },
    },
  });
  assert.deepEqual(requireSpotIntegration(full), {
    foreignMint: WSOL,
    foreignTokenProgram: TOKEN_2022,
    assetOracle: SYSTEM,
    foreignOracle: COMPUTE_BUDGET,
  });
});

test("requireSpotDirectWithdrawDiscriminator returns the bytes when set", () => {
  // Missing section, and an empty-array placeholder, both throw and name the field.
  assert.throws(
    () => requireSpotDirectWithdrawDiscriminator(baseProfile()),
    /integrations\.spot/
  );
  const placeholder = baseProfile({
    integrations: { spot: { directWithdrawDiscriminator: [] } },
  });
  assert.throws(
    () => requireSpotDirectWithdrawDiscriminator(placeholder),
    /integrations\.spot\.directWithdrawDiscriminator/
  );

  const discriminator = [232, 204, 244, 40, 201, 192, 7, 194];
  const full = baseProfile({
    integrations: { spot: { directWithdrawDiscriminator: discriminator } },
  });
  assert.deepEqual(
    requireSpotDirectWithdrawDiscriminator(full),
    discriminator
  );
});

test("SpotIntegrationSchema rejects a discriminator that is not 8 bytes", () => {
  const wrongLength = ScriptProfileSchema.safeParse({
    name: "ok",
    cluster: "devnet",
    vault: { assetMintAddress: USDC, assetTokenProgram: TOKEN_PROGRAM },
    integrations: { spot: { directWithdrawDiscriminator: [1, 2, 3] } },
  });
  assert.equal(wrongLength.success, false);

  const outOfRange = ScriptProfileSchema.safeParse({
    name: "ok",
    cluster: "devnet",
    vault: { assetMintAddress: USDC, assetTokenProgram: TOKEN_PROGRAM },
    integrations: {
      spot: { directWithdrawDiscriminator: [0, 0, 0, 0, 0, 0, 0, 256] },
    },
  });
  assert.equal(outOfRange.success, false);
});

test("requireTrustfulIntegration returns the strategy seed", () => {
  assert.throws(
    () => requireTrustfulIntegration(baseProfile()),
    /integrations\.trustful/
  );

  const full = baseProfile({
    integrations: { trustful: { strategySeedString: "my-seed" } },
  });
  assert.deepEqual(requireTrustfulIntegration(full), {
    strategySeedString: "my-seed",
  });
});

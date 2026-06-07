import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { address, type Address } from "@solana/kit";
import { z, type ZodIssue } from "zod";

const CLUSTERS = ["localnet", "devnet", "mainnet-beta"] as const;
export type Cluster = (typeof CLUSTERS)[number];

const isValidBase58Address = (value: string): boolean => {
  try {
    address(value);
    return true;
  } catch {
    return false;
  }
};

const AddressSchema = z
  .string()
  .refine(isValidBase58Address, {
    message: "must be a valid base58 Solana address",
  });

// Treat empty / whitespace-only strings as "not provided" so example templates
// with placeholder "" values still parse. Per-command accessors enforce
// presence when the field is actually required.
const OptionalAddressSchema = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  AddressSchema.optional()
);

const NonEmptyString = z
  .string()
  .min(1, { message: "must be a non-empty string" });

const OptionalNonEmptyString = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  NonEmptyString.optional()
);

// An 8-byte adaptor instruction discriminator, stored as a JSON array of bytes.
// This is a per-deployment value operators fill in, not a fixed adapter
// constant. An empty array — the example-template placeholder — is treated as
// "not provided", so a template still parses; the per-command accessor enforces
// presence. A present array must be exactly 8 bytes, each in 0..255.
const OptionalDiscriminatorSchema = z.preprocess(
  (value) => (Array.isArray(value) && value.length === 0 ? undefined : value),
  z
    .array(z.number().int().min(0).max(255))
    .length(8, { message: "must be exactly 8 bytes, each an integer in 0..255" })
    .optional()
);

export const VaultProfileSchema = z
  .object({
    name: OptionalNonEmptyString,
    assetMintAddress: AddressSchema,
    assetTokenProgram: AddressSchema,
    vaultAddress: OptionalAddressSchema,
    useLookupTable: z.boolean().optional(),
    lookupTableAddress: OptionalAddressSchema,
  })
  .strict();

export const KaminoIntegrationSchema = z
  .object({
    reserveAddress: OptionalAddressSchema,
    kvaultAddress: OptionalAddressSchema,
    // 8-byte adaptor instruction the kvault direct-withdraw flow invokes; bound
    // on-chain by `vault:init-direct-withdraw`. Per-deployment, hence a profile
    // value rather than a fixed adapter constant (see docs/adaptor-admin.md).
    directWithdrawDiscriminator: OptionalDiscriminatorSchema,
  })
  .strict();

export const SpotIntegrationSchema = z
  .object({
    foreignMintAddress: OptionalAddressSchema,
    foreignTokenProgram: OptionalAddressSchema,
    assetOracleAddress: OptionalAddressSchema,
    foreignOracleAddress: OptionalAddressSchema,
    // Only needed by `spot:earn:init-direct-withdraw`.
    directWithdrawDiscriminator: OptionalDiscriminatorSchema,
  })
  .strict();

export const TrustfulIntegrationSchema = z
  .object({
    strategySeedString: OptionalNonEmptyString,
  })
  .strict();

export const IntegrationsSchema = z
  .object({
    kamino: KaminoIntegrationSchema.optional(),
    spot: SpotIntegrationSchema.optional(),
    trustful: TrustfulIntegrationSchema.optional(),
  })
  .strict();

export const ScriptProfileSchema = z
  .object({
    name: NonEmptyString,
    cluster: z.enum(CLUSTERS),
    rpcUrl: OptionalNonEmptyString,
    vault: VaultProfileSchema,
    integrations: IntegrationsSchema.optional(),
  })
  .strict();

export type VaultProfile = z.infer<typeof VaultProfileSchema>;
export type ScriptProfile = z.infer<typeof ScriptProfileSchema>;
export type KaminoIntegration = z.infer<typeof KaminoIntegrationSchema>;
export type SpotIntegration = z.infer<typeof SpotIntegrationSchema>;
export type TrustfulIntegration = z.infer<typeof TrustfulIntegrationSchema>;

export class ProfileValidationError extends Error {
  constructor(
    public readonly profilePath: string,
    public readonly issues: ZodIssue[]
  ) {
    const formatted = issues
      .map((issue) => {
        const path = issue.path.length ? issue.path.join(".") : "(root)";
        return `  - ${path}: ${issue.message}`;
      })
      .join("\n");
    super(`Profile validation failed for ${profilePath}:\n${formatted}`);
    this.name = "ProfileValidationError";
  }
}

export class ProfileFieldError extends Error {
  constructor(
    public readonly profileName: string,
    public readonly field: string,
    options?: { command?: string; hint?: string }
  ) {
    const command = options?.command ? ` for command "${options.command}"` : "";
    const hint = options?.hint ? `\nHint: ${options.hint}` : "";
    super(
      `Profile "${profileName}" is missing required field "${field}"${command}.${hint}`
    );
    this.name = "ProfileFieldError";
  }
}

export async function loadProfile(profilePath: string): Promise<ScriptProfile> {
  const resolvedPath = resolve(profilePath);
  let raw: string;
  try {
    raw = await readFile(resolvedPath, "utf8");
  } catch (error) {
    throw new Error(
      `Failed to read profile at ${resolvedPath}: ${(error as Error).message}`
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(
      `Profile ${resolvedPath} is not valid JSON: ${(error as Error).message}`
    );
  }

  const result = ScriptProfileSchema.safeParse(parsed);
  if (!result.success) {
    throw new ProfileValidationError(resolvedPath, result.error.issues);
  }

  return result.data;
}

// Per-command accessors. Each one returns typed Address values and throws a
// ProfileFieldError that names the missing field (and the command requesting
// it) if the profile does not satisfy the command's requirements.

export interface AccessOptions {
  command?: string;
}

export function requireAssetMint(profile: ScriptProfile): Address {
  return address(profile.vault.assetMintAddress);
}

export function requireAssetTokenProgram(profile: ScriptProfile): Address {
  return address(profile.vault.assetTokenProgram);
}

export function requireVaultAddress(
  profile: ScriptProfile,
  options?: AccessOptions
): Address {
  if (!profile.vault.vaultAddress) {
    throw new ProfileFieldError(profile.name, "vault.vaultAddress", options);
  }
  return address(profile.vault.vaultAddress);
}

export function requireLookupTableAddress(
  profile: ScriptProfile,
  options?: AccessOptions
): Address {
  if (!profile.vault.lookupTableAddress) {
    throw new ProfileFieldError(profile.name, "vault.lookupTableAddress", {
      ...options,
      hint:
        "Set vault.lookupTableAddress in the profile, or disable vault.useLookupTable.",
    });
  }
  return address(profile.vault.lookupTableAddress);
}

export function resolveLookupTableAddresses(
  profile: ScriptProfile,
  options?: AccessOptions
): Address[] {
  if (!profile.vault.useLookupTable) {
    return [];
  }
  return [requireLookupTableAddress(profile, options)];
}

export interface KaminoIntegrationFields {
  reserve: Address;
  kvault: Address;
}

// Kamino's market and kvault strategies use different addresses, so each is
// requirable on its own. A market-only profile must not be rejected for a
// missing kvault address (and vice versa).
export function requireKaminoReserve(
  profile: ScriptProfile,
  options?: AccessOptions
): Address {
  const section = profile.integrations?.kamino;
  if (!section) {
    throw new ProfileFieldError(profile.name, "integrations.kamino", options);
  }
  if (!section.reserveAddress) {
    throw new ProfileFieldError(
      profile.name,
      "integrations.kamino.reserveAddress",
      options
    );
  }
  return address(section.reserveAddress);
}

export function requireKaminoKvault(
  profile: ScriptProfile,
  options?: AccessOptions
): Address {
  const section = profile.integrations?.kamino;
  if (!section) {
    throw new ProfileFieldError(profile.name, "integrations.kamino", options);
  }
  if (!section.kvaultAddress) {
    throw new ProfileFieldError(
      profile.name,
      "integrations.kamino.kvaultAddress",
      options
    );
  }
  return address(section.kvaultAddress);
}

// The direct-withdraw discriminator is a per-deployment value, so it lives in
// the profile (not a fixed adapter constant). `vault:init-direct-withdraw` binds
// it on-chain for the Kamino kvault strategy.
export function requireKaminoDirectWithdrawDiscriminator(
  profile: ScriptProfile,
  options?: AccessOptions
): number[] {
  const section = profile.integrations?.kamino;
  if (!section) {
    throw new ProfileFieldError(profile.name, "integrations.kamino", options);
  }
  if (!section.directWithdrawDiscriminator) {
    throw new ProfileFieldError(
      profile.name,
      "integrations.kamino.directWithdrawDiscriminator",
      {
        ...options,
        hint:
          "Set integrations.kamino.directWithdrawDiscriminator to the 8-byte adaptor instruction the kvault direct-withdraw flow invokes (a per-deployment value).",
      }
    );
  }
  return section.directWithdrawDiscriminator;
}

// Convenience accessor for operations that genuinely need both addresses.
export function requireKaminoIntegration(
  profile: ScriptProfile,
  options?: AccessOptions
): KaminoIntegrationFields {
  return {
    reserve: requireKaminoReserve(profile, options),
    kvault: requireKaminoKvault(profile, options),
  };
}

export interface SpotIntegrationFields {
  foreignMint: Address;
  foreignTokenProgram: Address;
  assetOracle: Address;
  foreignOracle: Address;
}

export function requireSpotIntegration(
  profile: ScriptProfile,
  options?: AccessOptions
): SpotIntegrationFields {
  const section = profile.integrations?.spot;
  if (!section) {
    throw new ProfileFieldError(profile.name, "integrations.spot", options);
  }
  const required: Array<[keyof SpotIntegration, string]> = [
    ["foreignMintAddress", "integrations.spot.foreignMintAddress"],
    ["foreignTokenProgram", "integrations.spot.foreignTokenProgram"],
    ["assetOracleAddress", "integrations.spot.assetOracleAddress"],
    ["foreignOracleAddress", "integrations.spot.foreignOracleAddress"],
  ];
  for (const [key, path] of required) {
    if (!section[key]) {
      throw new ProfileFieldError(profile.name, path, options);
    }
  }
  return {
    foreignMint: address(section.foreignMintAddress as string),
    foreignTokenProgram: address(section.foreignTokenProgram as string),
    assetOracle: address(section.assetOracleAddress as string),
    foreignOracle: address(section.foreignOracleAddress as string),
  };
}

/**
 * The Spot adaptor's direct-withdraw instruction discriminator (8 bytes). This is
 * a per-deployment value — `spot:earn:init-direct-withdraw` binds it to the
 * derived Jupiter `lending` strategy. Kept separate from the addresses in
 * {@link requireSpotIntegration} so swap/earn commands, which never need it, are
 * not forced to populate it.
 */
export function requireSpotDirectWithdrawDiscriminator(
  profile: ScriptProfile,
  options?: AccessOptions
): number[] {
  const section = profile.integrations?.spot;
  if (!section) {
    throw new ProfileFieldError(profile.name, "integrations.spot", options);
  }
  // Treat an empty array (the example-template placeholder) as "not provided",
  // matching the schema preprocessing — robust even for profiles built without
  // going through `loadProfile`.
  const discriminator = section.directWithdrawDiscriminator;
  if (!discriminator || discriminator.length === 0) {
    throw new ProfileFieldError(
      profile.name,
      "integrations.spot.directWithdrawDiscriminator",
      {
        ...options,
        hint: "The 8-byte adaptor direct-withdraw discriminator for this deployment, as a JSON array of integers, e.g. [232, 204, 244, 40, 201, 192, 7, 194].",
      }
    );
  }
  return discriminator;
}

export interface TrustfulIntegrationFields {
  strategySeedString: string;
}

export function requireTrustfulIntegration(
  profile: ScriptProfile,
  options?: AccessOptions
): TrustfulIntegrationFields {
  const section = profile.integrations?.trustful;
  if (!section) {
    throw new ProfileFieldError(profile.name, "integrations.trustful", options);
  }
  if (!section.strategySeedString) {
    throw new ProfileFieldError(
      profile.name,
      "integrations.trustful.strategySeedString",
      options
    );
  }
  return { strategySeedString: section.strategySeedString };
}

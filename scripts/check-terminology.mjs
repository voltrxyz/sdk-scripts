#!/usr/bin/env node
// Repository terminology guard.
//
// Voltr integration scripts is a standalone product: its documentation, code,
// CLI, and tests describe current behavior directly. Implementation provenance
// lives in Git history and the issue tracker, never on the product surface.
//
// This guard fails when any tracked first-party file reintroduces historical
// porting language. The banned phrases are assembled below as regex-source
// fragments (`[\s-]+`, alternations) so this file never contains the literal
// phrases it forbids and never flags itself — no self-exclusion needed.
//
// Scanned: every tracked file plus new, non-ignored files (so a branch's
// additions are covered), minus what .gitignore already drops (node_modules/,
// dist/, .env, .context/, …). Third-party lockfile content is excluded.

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** Files allowed to contain otherwise-banned tokens (third-party content). */
const EXCLUDED_FILES = new Set(["pnpm-lock.yaml"]);

/** Binary-ish extensions to skip defensively (the repo is text-only today). */
const BINARY_EXT = /\.(png|jpe?g|gif|ico|svg|pdf|woff2?|ttf|eot|wasm|lock)$/i;

/**
 * Forbidden case-insensitive terms, as regex sources. The patterns use
 * character classes and alternations (`[\s-]+`, `(?:…)`) so the literal phrases
 * they forbid never appear verbatim in this file and the guard never flags its
 * own source. Each `name` is a safe label for error output.
 *
 * The last rule catches references to the role-prefixed script filenames the
 * earlier per-fork repos used (e.g. a `<role>-<action>.ts` provenance note).
 * Current files are domain-named, never `<role>-…`, so this has no false
 * positives — verified against `git ls-files`.
 */
const RULES = [
  { name: "migrat* (ported status)", source: String.raw`\bmigrat(?:ions?|ed)\b` },
  { name: "legacy + script", source: String.raw`\blegacy[\s-]+scripts?\b` },
  { name: "legacy + repo", source: String.raw`\blegacy[\s-]+repos?` },
  {
    name: "old script filename",
    source: String.raw`\b(?:manager|admin|user|query)-[a-z0-9-]+\.ts\b`,
  },
];

function listFiles() {
  const out = execSync("git ls-files --cached --others --exclude-standard", {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return out
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

/**
 * Scan every in-scope file and return one entry per forbidden occurrence.
 * Exported so the offline test suite can assert the repository stays clean.
 */
export function findViolations() {
  const violations = [];
  for (const file of listFiles()) {
    if (EXCLUDED_FILES.has(file) || BINARY_EXT.test(file)) continue;
    let content;
    try {
      content = readFileSync(file, "utf8");
    } catch {
      continue; // deleted or unreadable between listing and read
    }
    const lines = content.split("\n");
    for (const rule of RULES) {
      const pattern = new RegExp(rule.source, "gi");
      lines.forEach((line, index) => {
        let match;
        while ((match = pattern.exec(line)) !== null) {
          violations.push({
            file,
            line: index + 1,
            term: match[0],
            rule: rule.name,
            snippet: line.trim().slice(0, 120),
          });
        }
      });
    }
  }
  return violations;
}

function main() {
  const violations = findViolations();
  if (violations.length === 0) {
    console.log("terminology check: OK — no historical porting language found.");
    return;
  }
  console.error(
    `terminology check: FAILED — ${violations.length} forbidden occurrence(s):\n`
  );
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}  [${v.rule}]  "${v.term}"`);
    console.error(`      ${v.snippet}`);
  }
  console.error(
    "\nThis workspace is a standalone product. State current behavior directly and" +
      "\nkeep implementation provenance in Git history / the issue tracker, not in" +
      "\nshipped files. See docs/testing.md."
  );
  process.exitCode = 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}

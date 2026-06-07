import { test } from "node:test";
import assert from "node:assert/strict";

import { findViolations } from "./check-terminology.mjs";

// Fails the offline test suite if any tracked first-party file reintroduces
// historical porting language. See check-terminology.mjs for the rules.
test("tracked files contain no historical porting terminology", () => {
  const violations = findViolations();
  const detail = violations
    .map((v) => `  ${v.file}:${v.line} [${v.rule}] "${v.term}"`)
    .join("\n");
  assert.equal(
    violations.length,
    0,
    `Found ${violations.length} forbidden occurrence(s):\n${detail}`
  );
});

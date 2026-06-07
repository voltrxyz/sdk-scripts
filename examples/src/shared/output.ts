/**
 * Tiny print helpers shared by the examples. The transaction modes print their
 * own structured result through core's `processOperation`; these cover the
 * surrounding framing and a side-effect-free `BuiltOperation` summary.
 */
import type { BuiltOperation } from "@voltr/scripts-core";

export function heading(text: string): void {
  console.log(`\n${text}`);
  console.log("=".repeat(text.length));
}

export function line(text = ""): void {
  console.log(text);
}

export function field(label: string, value: string, width = 22): void {
  console.log(`  ${label.padEnd(width)}${value}`);
}

export function note(text: string): void {
  console.log(`  note: ${text}`);
}

export function json(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

/** Summarize what a builder returned, before it is processed. */
export function printOperation(operation: BuiltOperation): void {
  field("operation", operation.label);
  field("instructions", String(operation.instructions.length));
  const luts = operation.lookupTableAddresses ?? [];
  field("lookupTables", luts.length ? String(luts.length) : "(none)");
  if (operation.metadata && Object.keys(operation.metadata).length > 0) {
    line("  metadata:");
    for (const [key, value] of Object.entries(operation.metadata)) {
      field(`  ${key}`, value);
    }
  }
}

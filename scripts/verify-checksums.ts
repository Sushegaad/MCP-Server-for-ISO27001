#!/usr/bin/env tsx
/**
 * verify-checksums.ts
 *
 * Re-computes the canonical SHA-256 checksum of each seed JSON file
 * and compares it against the values stored in checksums.json.
 *
 * Exits 0 if all checksums match.
 * Exits 1 if any checksum mismatches or checksums.json is missing.
 *
 * Run before committing seed data changes:
 *   npm run verify-checksums
 *
 * This is also run automatically as part of the CI pipeline to guard
 * against accidental modifications to seed data.
 */

import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const SEED_DIR   = join(process.cwd(), "src", "seed");
const CHECKSUMS_PATH = join(SEED_DIR, "checksums.json");

const SEED_FILES = [
  "controls-2022.json",
  "controls-2013.json",
  "version-mapping.json",
  "clause-requirements.json",
] as const;

type ChecksumMap = Record<string, string>;

// ── Load stored checksums ─────────────────────────────────────

if (!existsSync(CHECKSUMS_PATH)) {
  console.error(`[verify-checksums] ERROR: checksums.json not found at ${CHECKSUMS_PATH}`);
  console.error("  Run 'npm run generate-checksums' to generate it.");
  process.exit(1);
}

const stored: ChecksumMap = JSON.parse(readFileSync(CHECKSUMS_PATH, "utf8")) as ChecksumMap;

// ── Verify each file ──────────────────────────────────────────

function canonicalHash(filePath: string): string {
  const raw    = readFileSync(filePath, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  const canonical = JSON.stringify(parsed, null, 2);
  return createHash("sha256").update(canonical).digest("hex");
}

let failures = 0;

for (const filename of SEED_FILES) {
  const filePath = join(SEED_DIR, filename);

  if (!existsSync(filePath)) {
    console.error(`[verify-checksums] MISSING: ${filename}`);
    failures++;
    continue;
  }

  const expected = stored[filename];
  if (!expected) {
    console.error(`[verify-checksums] NO_ENTRY: ${filename} has no entry in checksums.json`);
    failures++;
    continue;
  }

  const actual = canonicalHash(filePath);
  if (actual === expected) {
    console.log(`[verify-checksums] OK       ${filename}`);
  } else {
    console.error(`[verify-checksums] MISMATCH ${filename}`);
    console.error(`  stored:  ${expected}`);
    console.error(`  actual:  ${actual}`);
    failures++;
  }
}

// ── Summary ───────────────────────────────────────────────────

if (failures === 0) {
  console.log(`\n[verify-checksums] All ${SEED_FILES.length} checksums verified. ✓`);
  process.exit(0);
} else {
  console.error(`\n[verify-checksums] ${failures} checksum failure(s).`);
  console.error("  Run 'npm run generate-checksums' to regenerate checksums.json");
  console.error("  after verifying that the seed data changes are intentional.");
  process.exit(1);
}

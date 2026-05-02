#!/usr/bin/env tsx
/**
 * generate-checksums.ts
 *
 * Reads each seed JSON file, computes a canonical SHA-256 checksum
 * (SHA-256 of JSON.stringify(parsedData, null, 2)), and writes the
 * results to src/seed/checksums.json.
 *
 * Run after modifying any seed JSON file:
 *   npm run generate-checksums
 *
 * The checksums.json file is imported by seeder.ts at runtime to
 * verify data integrity before inserting into the database.
 */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const SEED_DIR   = join(process.cwd(), "src", "seed");
const OUTPUT     = join(SEED_DIR, "checksums.json");

const SEED_FILES = [
  "controls-2022.json",
  "controls-2013.json",
  "version-mapping.json",
  "clause-requirements.json",
] as const;

type ChecksumMap = Record<(typeof SEED_FILES)[number], string>;

function canonicalHash(filePath: string): string {
  const raw    = readFileSync(filePath, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  // Canonical form: re-serialise with consistent 2-space indent.
  // seeder.ts hashes its imported JSON the same way.
  const canonical = JSON.stringify(parsed, null, 2);
  return createHash("sha256").update(canonical).digest("hex");
}

const checksums: Partial<ChecksumMap> = {};

for (const filename of SEED_FILES) {
  const filePath = join(SEED_DIR, filename);
  const hash     = canonicalHash(filePath);
  checksums[filename] = hash;
  console.log(`  ${hash}  ${filename}`);
}

writeFileSync(OUTPUT, JSON.stringify(checksums, null, 2) + "\n", "utf8");
console.log(`\nWrote ${OUTPUT}`);

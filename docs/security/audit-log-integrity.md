# Audit Log Integrity

## Overview

Every tool call — successful, denied, or errored — writes a tamper-evident record to two places simultaneously:

1. The `audit_log` table inside `isms.db` (AES-256 encrypted)
2. A JSON-L flat file at `AUDIT_LOG_PATH` (default: `./audit.jsonl`) for SIEM ingestion

Each record carries a `row_hash`: HMAC-SHA256 keyed with `HMAC_SECRET` over all 10 fields. Each record also carries `prev_hash`, which chains it to its predecessor — making any gap, edit, or reordering detectable.

## The HMAC-SHA256 Chain

### Field specification

The hash input is the 10 fields joined by a pipe character (`|`), in this exact order:

```
id | timestamp | tool | key_hash | role | params_json | outcome | error_message | duration_ms | prev_hash
```

| Field | Type | Notes |
|-------|------|-------|
| `id` | UUID | `randomUUID()` — unique per row |
| `timestamp` | ISO string | `YYYY-MM-DD HH:MM:SSZ` format |
| `tool` | string | MCP tool name, e.g. `update_control_status` |
| `key_hash` | hex string | HMAC-SHA256 of the API key — never the raw key |
| `role` | string | `viewer`, `analyst`, or `admin` |
| `params_json` | JSON string | Sanitised params; secrets redacted; content > 200 chars truncated |
| `outcome` | string | `success`, `denied`, or `error` |
| `error_message` | string | Empty string `""` if no error (never null in hash input) |
| `duration_ms` | string | Milliseconds as a decimal string, e.g. `"42"` |
| `prev_hash` | string | `row_hash` of the preceding row; `"GENESIS"` for the first row |

### Hash algorithm

```
row_hash = HMAC-SHA256(key=HMAC_SECRET, data=field_string)
```

Where `field_string` is the 10 fields joined by `|`, with:
- `error_message = ""` (empty string) when null
- `prev_hash = "GENESIS"` (literal string) for the first row in the table

The result is a lowercase hex string, 64 characters long.

## Detecting Tampering

### Edited row
Recomputing `row_hash` over the 10 fields will produce a different value than the stored `row_hash`. `verifyRowHash()` returns `false`.

### Deleted row
The next row's `prev_hash` will not match the `row_hash` of the row that now precedes it. The chain breaks at the deletion point.

### Reordered rows
The `prev_hash` -> `row_hash` chain will be invalid at the swap boundary. Both swapped rows will fail chain verification.

### Inserted row
The inserted row's `prev_hash` will not match the `row_hash` of its claimed predecessor. The chain breaks at the insertion point.

## Verification Scripts

These standalone scripts verify the JSONL audit log without running the server. They require only the `HMAC_SECRET` value — keep it separate from the log for independent verification.

### Node.js (no npm install required)

```javascript
#!/usr/bin/env node
// verify-audit-log.mjs
// Usage: HMAC_SECRET=<your-secret> node verify-audit-log.mjs ./audit.jsonl

import { createHmac } from "node:crypto";
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";

const HMAC_SECRET = process.env.HMAC_SECRET;
if (!HMAC_SECRET) { console.error("HMAC_SECRET env var required"); process.exit(1); }

const logFile = process.argv[2];
if (!logFile) { console.error("Usage: node verify-audit-log.mjs <path-to-audit.jsonl>"); process.exit(1); }

const rl = createInterface({ input: createReadStream(logFile) });
let prevHash = null;
let lineNum = 0;
let errors = 0;

rl.on("line", (line) => {
  if (!line.trim()) return;
  lineNum++;
  const row = JSON.parse(line);

  const expectedPrevHash = prevHash ?? "GENESIS";

  // Reconstruct hash input in exact field order
  const hashInput = [
    row.id,
    row.timestamp,
    row.tool,
    row.key_hash,
    row.role,
    row.params_json,
    row.outcome,
    row.error_message ?? "",
    String(row.duration_ms),
    expectedPrevHash,
  ].join("|");

  const computed = createHmac("sha256", HMAC_SECRET).update(hashInput).digest("hex");

  const hashOk  = computed === row.row_hash;
  const chainOk = row.prev_hash === expectedPrevHash;

  if (hashOk && chainOk) {
    console.log(`✅ Line ${lineNum} [${row.id}] OK`);
  } else {
    if (!hashOk)  console.error(`❌ Line ${lineNum} [${row.id}] row_hash MISMATCH (expected ${computed}, got ${row.row_hash})`);
    if (!chainOk) console.error(`❌ Line ${lineNum} [${row.id}] prev_hash MISMATCH (expected ${expectedPrevHash}, got ${row.prev_hash})`);
    errors++;
  }

  prevHash = row.row_hash;
});

rl.on("close", () => {
  console.log(`\nVerified ${lineNum} records. Errors: ${errors}`);
  process.exit(errors > 0 ? 1 : 0);
});
```

### Python (stdlib only, no pip install required)

```python
#!/usr/bin/env python3
# verify-audit-log.py
# Usage: HMAC_SECRET=<your-secret> python3 verify-audit-log.py audit.jsonl

import hmac, hashlib, json, os, sys

secret = os.environ.get("HMAC_SECRET", "").encode()
if not secret:
    print("HMAC_SECRET env var required", file=sys.stderr)
    sys.exit(1)

log_file = sys.argv[1] if len(sys.argv) > 1 else None
if not log_file:
    print("Usage: python3 verify-audit-log.py <path-to-audit.jsonl>", file=sys.stderr)
    sys.exit(1)

prev_hash = None
errors = 0

with open(log_file, "r", encoding="utf-8") as f:
    for line_num, line in enumerate(f, 1):
        line = line.strip()
        if not line:
            continue

        row = json.loads(line)
        expected_prev = prev_hash if prev_hash is not None else "GENESIS"

        hash_input = "|".join([
            row["id"],
            row["timestamp"],
            row["tool"],
            row["key_hash"],
            row["role"],
            row["params_json"],
            row["outcome"],
            row.get("error_message") or "",
            str(row["duration_ms"]),
            expected_prev,
        ]).encode("utf-8")

        computed = hmac.new(secret, hash_input, hashlib.sha256).hexdigest()

        hash_ok  = computed == row["row_hash"]
        chain_ok = row.get("prev_hash") == expected_prev

        if hash_ok and chain_ok:
            print(f"✅ Line {line_num} [{row['id']}] OK")
        else:
            if not hash_ok:
                print(f"❌ Line {line_num} [{row['id']}] row_hash MISMATCH", file=sys.stderr)
            if not chain_ok:
                print(f"❌ Line {line_num} [{row['id']}] prev_hash MISMATCH", file=sys.stderr)
            errors += 1

        prev_hash = row["row_hash"]

print(f"\nVerified {line_num} records. Errors: {errors}")
sys.exit(1 if errors > 0 else 0)
```

## Using `query_audit_log` (Admin Tool)

The `query_audit_log` MCP tool (requires `admin` role) queries the `audit_log` table directly. It returns `row_hash` and `prev_hash` for each row so you can cross-reference against the JSONL file.

**Example Claude prompts:**
- "Query the audit log for all denied tool calls in the last 24 hours"
- "Show me every admin-role call this week"
- "Check the audit log for any errors on the `update_control_status` tool"
- "List all tool calls made by the key with label 'alice-analyst'"

## Off-Machine Retention

The HMAC chain detects in-place tampering of the JSONL file. For legally defensible audit trails, combine this with off-machine retention:

| Solution | Tamper resistance | Notes |
|---------|-------------------|-------|
| AWS S3 + Object Lock (Compliance mode) | WORM — cannot be deleted or overwritten | Highest assurance |
| Azure Blob Storage + immutability policy | WORM | Similar to S3 Object Lock |
| Splunk / Elastic SIEM | Retention + search; not strictly WORM | Combine with S3 for full assurance |
| HashiCorp Vault audit log | Append-only; signed | Good for self-hosted environments |

## Legal Disclaimer

The HMAC audit chain provides a technical mechanism for detecting modification or reordering of audit records. It does not constitute a legally certified audit trail under any specific regulatory framework. Operators seeking legal defensibility should combine this mechanism with off-machine, immutable log retention and may wish to engage a qualified auditor or legal counsel to assess suitability for their specific compliance context.

**This software is not a substitute for professional legal, regulatory, or audit judgment.**

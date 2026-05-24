/**
 * iso27001-mcp — CLI I/O helpers
 *
 * Thin readline wrapper used by `init` and `doctor`.
 * The readline interface is created lazily on first use so importing
 * this module in non-interactive paths (server startup, keygen) has
 * zero cost.
 *
 * Always call closePrompt() before process.exit() to avoid the process
 * hanging on an open stdin stream.
 */

import readline from "node:readline";

let _rl: readline.Interface | null = null;

function getRl(): readline.Interface {
  if (!_rl) {
    _rl = readline.createInterface({
      input:  process.stdin,
      output: process.stdout,
    });
    // Prevent readline from keeping the process alive indefinitely.
    // We close it explicitly via closePrompt().
    _rl.on("close", () => { _rl = null; });
  }
  return _rl;
}

// ── Public API ────────────────────────────────────────────────

/**
 * Ask a question and return the trimmed answer.
 * If the user presses Enter with no input and defaultVal is set, return defaultVal.
 */
export async function ask(question: string, defaultVal?: string): Promise<string> {
  const suffix = defaultVal !== undefined ? ` (${defaultVal})` : "";
  return new Promise((resolve) => {
    getRl().question(`${question}${suffix}: `, (answer) => {
      const trimmed = answer.trim();
      resolve(trimmed !== "" ? trimmed : (defaultVal ?? ""));
    });
  });
}

/**
 * Ask a yes/no question. Returns true for yes.
 * defaultYes=true → pressing Enter counts as yes.
 */
export async function confirm(question: string, defaultYes = true): Promise<boolean> {
  const hint  = defaultYes ? "[Y/n]" : "[y/N]";
  const answer = await ask(`${question} ${hint}`, defaultYes ? "y" : "n");
  return /^y(es)?$/i.test(answer);
}

/** Print a prominent banner box. */
export function banner(lines: string[]): void {
  const width  = 60;
  const border = "=".repeat(width);
  process.stdout.write(`\n${border}\n`);
  for (const line of lines) {
    process.stdout.write(`  ${line}\n`);
  }
  process.stdout.write(`${border}\n\n`);
}

/** Print a numbered step label. */
export function step(n: number, total: number, label: string): void {
  process.stdout.write(`  [${n}/${total}] ${label}\n`);
}

/** Print a single blank line. */
export function blank(): void {
  process.stdout.write("\n");
}

/** Print a plain indented line. */
export function info(msg: string): void {
  process.stdout.write(`  ${msg}\n`);
}

/**
 * Print a ✅ / ❌ / -- check line for the doctor command.
 *
 * @param label   - left-column label (padded to 28 chars)
 * @param passed  - true = ✅, false = ❌
 * @param skipped - true = -- (dependent check skipped due to earlier failure)
 * @param detail  - optional right-column detail / hint
 */
export function check(
  label:   string,
  passed:  boolean,
  skipped = false,
  detail?: string,
): void {
  const icon        = skipped ? "  --" : passed ? "  ✅" : "  ❌";
  const labelPadded = label.padEnd(28);
  const detailStr   = detail ? `  ${detail}` : "";
  process.stdout.write(`${icon} ${labelPadded}${detailStr}\n`);
}

/** Close the readline interface. Call before process.exit(). */
export function closePrompt(): void {
  if (_rl) {
    _rl.close();
    _rl = null;
  }
}

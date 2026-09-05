/**
 * iso27001-mcp — shared CSV utilities
 *
 * parseCsv — RFC 4180 tokenizer (quoted fields, escaped double-quotes,
 *            commas/newlines inside quotes, CRLF and LF line endings).
 * csvCell  — serializer for a single cell with OWASP CSV-injection
 *            hardening (prefix-escapes spreadsheet formula triggers).
 *
 * Both importers (csv-import.ts) and all CSV exporters (risks.ts,
 * gap-analysis.ts, soa.ts) share these so export → import round-trips.
 */

/** Parse RFC 4180 CSV: quoted fields, escaped double-quotes (""), commas and
 *  newlines inside quotes, CRLF and LF line endings. Returns rows of cells.
 *  Fully-empty rows (blank lines, or rows whose cells are all empty) are
 *  skipped. */
export function parseCsv(raw: string): string[][] {
  const rows: string[][] = [];
  let row: string[]  = [];
  let cell           = "";
  let inQuotes       = false;
  let cellStarted    = false; // true once the current row has any content/cell boundary

  const endCell = (): void => {
    row.push(cell);
    cell = "";
  };

  const endRow = (): void => {
    endCell();
    if (row.some((c) => c.length > 0)) rows.push(row);
    row = [];
    cellStarted = false;
  };

  for (let i = 0; i < raw.length; i++) {
    const ch = raw.charAt(i);

    if (inQuotes) {
      if (ch === '"') {
        if (raw.charAt(i + 1) === '"') {
          cell += '"';   // escaped double-quote
          i++;
        } else {
          inQuotes = false; // closing quote
        }
      } else {
        cell += ch;       // any char (incl. , \r \n) is literal inside quotes
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      cellStarted = true;
    } else if (ch === ",") {
      endCell();
      cellStarted = true;
    } else if (ch === "\r") {
      if (raw.charAt(i + 1) === "\n") i++; // CRLF → one line ending
      endRow();
    } else if (ch === "\n") {
      endRow();
    } else {
      cell += ch;
      cellStarted = true;
    }
  }

  // Flush the final row when the input has no trailing newline.
  if (cell.length > 0 || row.length > 0 || cellStarted) endRow();

  return rows;
}

/** Characters that make a cell require quoting per RFC 4180. */
const NEEDS_QUOTING = /[",\n\r]/;

/** True when a cell value would be interpreted as a spreadsheet formula
 *  (OWASP CSV-injection): = + - @ after optional leading whitespace
 *  (Excel skips leading spaces before evaluating), or a leading TAB/CR. */
export function isFormulaTrigger(s: string): boolean {
  return /^\s*[=+\-@]/.test(s) || /^[\t\r]/.test(s);
}

/** Serialize one CSV cell: always quote when the value contains , " \n or \r;
 *  escape embedded quotes as "". Additionally prefix-escape spreadsheet formula
 *  triggers (=, +, -, @ — including after leading whitespace — and tab/CR at
 *  cell start) with a leading single quote to block CSV-injection when the
 *  file is opened in Excel/Sheets. */
export function csvCell(value: unknown): string {
  let s = value === null || value === undefined ? "" : String(value);
  if (isFormulaTrigger(s)) s = "'" + s;
  if (NEEDS_QUOTING.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}

/** Undo csvCell()'s formula-trigger escape on import: strip ONE leading
 *  apostrophe only when the remainder is itself a formula trigger. Legit
 *  values that happen to start with an apostrophe are left untouched
 *  (an apostrophe followed by a non-trigger was never added by csvCell). */
export function unescapeCsvCell(s: string): string {
  return s.startsWith("'") && isFormulaTrigger(s.slice(1)) ? s.slice(1) : s;
}

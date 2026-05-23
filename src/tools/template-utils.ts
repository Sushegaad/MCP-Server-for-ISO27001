/**
 * iso27001-mcp — Shared template utilities
 *
 * loadTemplate()      — resolve and read a Mustache .md template file
 * loadPartials()      — load all Mustache partials from seed/partials/
 * stripFrontmatter()  — extract YAML frontmatter and return body + mappings
 *
 * Used by policies.ts, procedures.ts, and evidence-templates.ts.
 *
 * Partials provide shared header/footer blocks so templates don't duplicate
 * boilerplate. Available: {{> org_header}}, {{> revision_block}},
 * {{> approver_signature}}.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { businessRule } from "../types/errors.js";

export type TemplateDir = "policy-templates" | "procedure-templates" | "evidence-templates";

/**
 * Load a raw Mustache template from seed/<dir>/<type>.md.
 * Tries the compiled dist/ path first, then source paths for dev/test.
 */
export function loadTemplate(type: string, dir: TemplateDir): string {
  const candidates = [
    // dist/tools → dist/seed/<dir>  (compiled CJS bundle)
    join(__dirname, `../seed/${dir}`, `${type}.md`),
    // Running tests directly from source
    join(process.cwd(), `src/seed/${dir}`, `${type}.md`),
    // Running after npm run build
    join(process.cwd(), `dist/seed/${dir}`, `${type}.md`),
  ];

  for (const candidate of candidates) {
    try {
      return readFileSync(candidate, "utf8");
    } catch {
      // try next candidate
    }
  }

  throw businessRule(
    "type",
    `Template file not found for '${type}' in '${dir}'. ` +
    `Run 'npm run build' to ensure templates are copied into dist/.`,
  );
}

// ── Partial names ─────────────────────────────────────────────

const PARTIAL_NAMES = ["org_header", "revision_block", "approver_signature"] as const;

/**
 * Load all Mustache partials from seed/partials/.
 * Returns a Record<partialName, partialContent> suitable for passing
 * as the third argument to Mustache.render(template, view, partials).
 *
 * Partials that cannot be found are silently returned as empty strings
 * so templates that don't use them are unaffected.
 */
export function loadPartials(): Record<string, string> {
  const partials: Record<string, string> = {};

  for (const name of PARTIAL_NAMES) {
    const candidates = [
      join(__dirname, `../seed/partials`, `${name}.md`),
      join(process.cwd(), `src/seed/partials`, `${name}.md`),
      join(process.cwd(), `dist/seed/partials`, `${name}.md`),
    ];

    for (const candidate of candidates) {
      try {
        partials[name] = readFileSync(candidate, "utf8");
        break;
      } catch {
        // try next candidate
      }
    }

    if (!partials[name]) {
      partials[name] = ""; // graceful fallback
    }
  }

  return partials;
}

/**
 * Strip YAML frontmatter (--- ... ---) from a raw template string.
 * Returns the template body and parsed clause/control mapping arrays.
 */
export function stripFrontmatter(raw: string): {
  template:       string;
  clauseMappings: string[];
  controlMappings: string[];
} {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { template: raw, clauseMappings: [], controlMappings: [] };

  const frontmatter = match[1];
  const template    = match[2];

  const clauseMatch  = frontmatter.match(/clause_mappings:\s*(\[.*?\])/);
  const controlMatch = frontmatter.match(/control_mappings:\s*(\[.*?\])/);

  let clauseMappings:  string[] = [];
  let controlMappings: string[] = [];

  try { if (clauseMatch)  clauseMappings  = JSON.parse(clauseMatch[1].replace(/'/g, '"'))  as string[]; } catch { /* ignore */ }
  try { if (controlMatch) controlMappings = JSON.parse(controlMatch[1].replace(/'/g, '"')) as string[]; } catch { /* ignore */ }

  return { template, clauseMappings, controlMappings };
}

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

/**
 * Minimal Markdown-to-HTML converter for structured ISMS documents.
 * Handles headings h1/h2/h3, bold, italic, code, tables, lists, hr, paragraphs.
 */
export function markdownToHtml(md: string): string {
  const lines = md.split("\n");
  const out: string[] = [];
  let inTable = false;
  let inList  = false;
  let tableHeaderDone = false;

  const esc = (s: string): string =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const inline = (s: string): string =>
    s
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\*([^*]+)\*/g,     "<em>$1</em>")
      .replace(/`([^`]+)`/g,       "<code>$1</code>");

  for (const line of lines) {
    const h1 = line.match(/^# (.+)/);
    const h2 = line.match(/^## (.+)/);
    const h3 = line.match(/^### (.+)/);

    if (h1 || h2 || h3) {
      if (inList)  { out.push("</ul>");           inList  = false; }
      if (inTable) { out.push("</tbody></table>"); inTable = false; tableHeaderDone = false; }
      if (h1) { out.push(`<h1>${inline(esc(h1[1]))}</h1>`); continue; }
      if (h2) { out.push(`<h2>${inline(esc(h2[1]))}</h2>`); continue; }
      if (h3) { out.push(`<h3>${inline(esc(h3[1]))}</h3>`); continue; }
    }

    if (/^---+$/.test(line.trim())) {
      if (inList)  { out.push("</ul>");           inList  = false; }
      if (inTable) { out.push("</tbody></table>"); inTable = false; tableHeaderDone = false; }
      out.push("<hr>"); continue;
    }

    if (line.trim().startsWith("|")) {
      if (inList) { out.push("</ul>"); inList = false; }
      if (/^\|[-| :]+\|$/.test(line.trim())) {
        if (!tableHeaderDone) { out.push("<tbody>"); tableHeaderDone = true; }
        continue;
      }
      const cells = line.split("|").slice(1, -1).map(c => c.trim());
      if (!inTable) {
        out.push('<table><thead><tr>');
        cells.forEach(c => out.push(`<th>${inline(esc(c))}</th>`));
        out.push("</tr></thead>");
        inTable = true; tableHeaderDone = false;
        continue;
      }
      out.push("<tr>");
      cells.forEach(c => out.push(`<td>${inline(esc(c))}</td>`));
      out.push("</tr>");
      continue;
    }

    if (inTable) { out.push("</tbody></table>"); inTable = false; tableHeaderDone = false; }

    if (/^[-*] /.test(line)) {
      if (!inList) { out.push("<ul>"); inList = true; }
      out.push(`<li>${inline(esc(line.replace(/^[-*] /, "")))}</li>`);
      continue;
    }
    if (inList && line.trim() === "") { out.push("</ul>"); inList = false; }

    if (line.trim() === "") { out.push(""); continue; }
    if (!inList) out.push(`<p>${inline(esc(line))}</p>`);
  }

  if (inList)  out.push("</ul>");
  if (inTable) out.push("</tbody></table>");
  return out.join("\n");
}

export interface HtmlDocumentMeta {
  title:             string;
  organisation_name: string;
  logo_url?:         string | null;
  primary_color?:    string | null;
  document_footer?:  string | null;
  version?:          string | number;
  effective_date?:   string;
  owner?:            string;
  doc_type?:         string;
}

/**
 * Wrap converted HTML body in a branded, print-ready document shell.
 * The returned string is a fully self-contained HTML file.
 * File → Print → Save as PDF in any browser produces a clean document.
 */
export function renderHtmlDocument(bodyHtml: string, meta: HtmlDocumentMeta): string {
  const color  = meta.primary_color ?? "#1e3a5f";
  const footer = meta.document_footer ?? meta.organisation_name;
  const today  = new Date().toISOString().slice(0, 10);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>${meta.title} — ${meta.organisation_name}</title>
  <style>
    *,*::before,*::after{box-sizing:border-box}
    body{font-family:'Segoe UI',Arial,sans-serif;font-size:11pt;line-height:1.6;color:#1a1a1a;margin:0;padding:0;background:#fff}
    .doc-header{background:${color};color:#fff;padding:24px 40px 18px;display:flex;align-items:center;gap:20px}
    .doc-header-logo{max-height:48px;max-width:160px;object-fit:contain}
    .doc-header-text{flex:1}
    .doc-header h1{margin:0 0 4px;font-size:18pt;font-weight:700;color:#fff}
    .doc-header-sub{font-size:10pt;opacity:0.85}
    .doc-meta-bar{background:#f5f7fa;border-bottom:2px solid ${color};padding:10px 40px;display:flex;gap:32px;font-size:9pt;color:#444}
    .doc-meta-item strong{color:#111}
    .doc-body{padding:28px 40px;max-width:900px}
    h1{font-size:16pt;color:${color};margin-top:24px;border-bottom:2px solid ${color};padding-bottom:4px}
    h2{font-size:13pt;color:${color};margin-top:20px}
    h3{font-size:11pt;color:#333;margin-top:16px}
    table{width:100%;border-collapse:collapse;margin:14px 0;font-size:10pt}
    th{background:${color};color:#fff;padding:7px 10px;text-align:left;font-weight:600}
    td{padding:6px 10px;border-bottom:1px solid #e0e4ea;vertical-align:top}
    tr:nth-child(even) td{background:#f8f9fb}
    ul{padding-left:20px;margin:8px 0}
    li{margin:3px 0}
    hr{border:none;border-top:1px solid #dce1ea;margin:20px 0}
    p{margin:8px 0}
    code{background:#f0f2f5;padding:1px 5px;border-radius:3px;font-family:monospace;font-size:10pt}
    .doc-footer{margin-top:40px;padding:14px 40px;background:#f5f7fa;border-top:2px solid ${color};font-size:9pt;color:#666;display:flex;justify-content:space-between}
    @media print{
      body{font-size:10pt}
      .doc-header,.doc-meta-bar,th,.doc-footer{-webkit-print-color-adjust:exact;print-color-adjust:exact}
      h1,h2{page-break-after:avoid}
      table{page-break-inside:avoid}
    }
  </style>
</head>
<body>
  <div class="doc-header">
    ${meta.logo_url ? `<img class="doc-header-logo" src="${meta.logo_url}" alt="${meta.organisation_name} logo">` : ""}
    <div class="doc-header-text">
      <h1>${meta.title}</h1>
      <div class="doc-header-sub">${meta.organisation_name}${meta.doc_type ? ` · ${meta.doc_type}` : ""}</div>
    </div>
  </div>
  <div class="doc-meta-bar">
    ${meta.version        ? `<span><strong>Version:</strong> ${meta.version}</span>` : ""}
    ${meta.effective_date ? `<span><strong>Effective:</strong> ${meta.effective_date}</span>` : ""}
    ${meta.owner          ? `<span><strong>Owner:</strong> ${meta.owner}</span>` : ""}
    <span><strong>Generated:</strong> ${today}</span>
  </div>
  <div class="doc-body">${bodyHtml}</div>
  <div class="doc-footer">
    <span>${footer}</span>
    <span>INTERNAL — ISMS Controlled Document · Generated ${today}</span>
  </div>
</body>
</html>`;
}

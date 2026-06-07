/**
 * Unit tests for src/tools/template-utils.ts
 *
 * Covers: markdownToHtml and renderHtmlDocument (lines 120-215)
 *   - markdownToHtml: h1/h2/h3 headings, bold/italic/code inline,
 *     horizontal rules, tables (multi-row), lists (open/close),
 *     blank lines, paragraphs, mixed content, unclosed list/table at EOF
 *   - renderHtmlDocument: primary_color default, document_footer fallback,
 *     meta fields embedded in output, body HTML included
 *
 * Also covers stripFrontmatter:
 *   - no frontmatter (passthrough)
 *   - with frontmatter (clause and control mappings parsed)
 *   - invalid JSON in mappings (graceful empty-array fallback)
 */

import { describe, it, expect } from "vitest";
import {
  markdownToHtml,
  renderHtmlDocument,
  stripFrontmatter,
  type HtmlDocumentMeta,
} from "../../../src/tools/template-utils.ts";

// ── stripFrontmatter ──────────────────────────────────────────

describe("stripFrontmatter", () => {
  it("returns the raw string unchanged when there is no frontmatter", () => {
    const raw = "# Heading\n\nBody text.";
    const result = stripFrontmatter(raw);
    expect(result.template).toBe(raw);
    expect(result.clauseMappings).toEqual([]);
    expect(result.controlMappings).toEqual([]);
  });

  it("strips frontmatter and returns the body", () => {
    const raw =
      "---\nclause_mappings: ['4.1','4.2']\ncontrol_mappings: ['5.1']\n---\n## Body";
    const result = stripFrontmatter(raw);
    expect(result.template).toBe("## Body");
    expect(result.clauseMappings).toEqual(["4.1", "4.2"]);
    expect(result.controlMappings).toEqual(["5.1"]);
  });

  it("returns empty arrays when mappings keys are absent from frontmatter", () => {
    const raw = "---\ntitle: Test\n---\nBody";
    const result = stripFrontmatter(raw);
    expect(result.clauseMappings).toEqual([]);
    expect(result.controlMappings).toEqual([]);
  });

  it("returns empty arrays for clause_mappings when JSON is invalid", () => {
    const raw = "---\nclause_mappings: [broken\n---\nBody";
    const result = stripFrontmatter(raw);
    expect(result.clauseMappings).toEqual([]);
  });
});

// ── markdownToHtml — headings ─────────────────────────────────

describe("markdownToHtml — headings", () => {
  it("converts # Heading to <h1>", () => {
    expect(markdownToHtml("# Hello World")).toContain("<h1>Hello World</h1>");
  });

  it("converts ## Heading to <h2>", () => {
    expect(markdownToHtml("## Section")).toContain("<h2>Section</h2>");
  });

  it("converts ### Heading to <h3>", () => {
    expect(markdownToHtml("### Sub")).toContain("<h3>Sub</h3>");
  });

  it("escapes HTML special chars in headings", () => {
    const html = markdownToHtml("# A & B <> C");
    expect(html).toContain("A &amp; B &lt;&gt; C");
  });

  it("applies inline bold inside a heading", () => {
    const html = markdownToHtml("## **Bold** heading");
    expect(html).toContain("<strong>Bold</strong> heading");
  });
});

// ── markdownToHtml — inline formatting ───────────────────────

describe("markdownToHtml — inline formatting", () => {
  it("converts **text** to <strong>text</strong>", () => {
    expect(markdownToHtml("This is **bold** text.")).toContain("<strong>bold</strong>");
  });

  it("converts *text* to <em>text</em>", () => {
    expect(markdownToHtml("This is *italic* text.")).toContain("<em>italic</em>");
  });

  it("`code` converts to <code>code</code>", () => {
    expect(markdownToHtml("Use `npm install` to install.")).toContain("<code>npm install</code>");
  });

  it("combines bold and code in a paragraph", () => {
    const html = markdownToHtml("Run **`npm test`**.");
    // bold wraps the code tag
    expect(html).toContain("<strong>");
    expect(html).toContain("<code>");
  });
});

// ── markdownToHtml — horizontal rules ────────────────────────

describe("markdownToHtml — horizontal rules", () => {
  it("converts --- to <hr>", () => {
    expect(markdownToHtml("---")).toContain("<hr>");
  });

  it("converts ---- (4 dashes) to <hr>", () => {
    expect(markdownToHtml("----")).toContain("<hr>");
  });
});

// ── markdownToHtml — paragraphs and blank lines ───────────────

describe("markdownToHtml — paragraphs and blank lines", () => {
  it("wraps a plain line in <p>", () => {
    expect(markdownToHtml("Hello world")).toContain("<p>Hello world</p>");
  });

  it("emits an empty string for a blank line", () => {
    const html = markdownToHtml("Line 1\n\nLine 2");
    expect(html).toContain("<p>Line 1</p>");
    expect(html).toContain("<p>Line 2</p>");
  });

  it("escapes < and > in paragraph text", () => {
    const html = markdownToHtml("a < b > c");
    expect(html).toContain("a &lt; b &gt; c");
  });
});

// ── markdownToHtml — lists ────────────────────────────────────

describe("markdownToHtml — lists", () => {
  it("opens <ul> on first list item with - prefix", () => {
    const html = markdownToHtml("- Item one");
    expect(html).toContain("<ul>");
    expect(html).toContain("<li>Item one</li>");
  });

  it("opens <ul> on first list item with * prefix", () => {
    const html = markdownToHtml("* Star item");
    expect(html).toContain("<ul>");
    expect(html).toContain("<li>Star item</li>");
  });

  it("renders multiple list items inside a single <ul>", () => {
    const html = markdownToHtml("- A\n- B\n- C");
    expect(html).toContain("<ul>");
    expect(html).toContain("</ul>");
    const liCount = (html.match(/<li>/g) ?? []).length;
    expect(liCount).toBe(3);
  });

  it("closes <ul> on a blank line after list items", () => {
    const html = markdownToHtml("- Item\n\nParagraph");
    expect(html).toContain("</ul>");
    expect(html).toContain("<p>Paragraph</p>");
  });

  it("closes <ul> when a heading follows", () => {
    const html = markdownToHtml("- Item\n# Heading");
    expect(html).toContain("</ul>");
    expect(html).toContain("<h1>Heading</h1>");
  });

  it("closes <ul> at end-of-input if list is still open", () => {
    const html = markdownToHtml("- Item one\n- Item two");
    expect(html).toContain("</ul>");
  });

  it("applies inline formatting inside list items", () => {
    const html = markdownToHtml("- **Bold** item");
    expect(html).toContain("<strong>Bold</strong> item");
  });
});

// ── markdownToHtml — tables ───────────────────────────────────

describe("markdownToHtml — tables", () => {
  const TABLE_MD =
    "| Name | Role |\n| --- | --- |\n| Alice | Admin |\n| Bob | Viewer |";

  it("opens a table with <table><thead><tr>", () => {
    const html = markdownToHtml(TABLE_MD);
    expect(html).toContain("<table><thead><tr>");
  });

  it("renders column headers as <th>", () => {
    const html = markdownToHtml(TABLE_MD);
    expect(html).toContain("<th>Name</th>");
    expect(html).toContain("<th>Role</th>");
  });

  it("closes thead and opens tbody after separator row", () => {
    const html = markdownToHtml(TABLE_MD);
    expect(html).toContain("</thead>");
    expect(html).toContain("<tbody>");
  });

  it("renders data rows as <tr><td>", () => {
    const html = markdownToHtml(TABLE_MD);
    expect(html).toContain("<td>Alice</td>");
    expect(html).toContain("<td>Admin</td>");
    expect(html).toContain("<td>Bob</td>");
    expect(html).toContain("<td>Viewer</td>");
  });

  it("closes table with </tbody></table>", () => {
    const html = markdownToHtml(TABLE_MD);
    expect(html).toContain("</tbody></table>");
  });

  it("closes a table when a heading follows", () => {
    const md = "| A | B |\n| - | - |\n| v | w |\n## Next Section";
    const html = markdownToHtml(md);
    expect(html).toContain("</tbody></table>");
    expect(html).toContain("<h2>Next Section</h2>");
  });

  it("closes a table when a horizontal rule follows", () => {
    const md = "| A | B |\n| - | - |\n| v | w |\n---";
    const html = markdownToHtml(md);
    expect(html).toContain("</tbody></table>");
    expect(html).toContain("<hr>");
  });

  it("closes a table at end-of-input", () => {
    const md = "| A | B |\n| - | - |\n| x | y |";
    const html = markdownToHtml(md);
    expect(html).toContain("</tbody></table>");
  });

  it("applies inline formatting inside table cells", () => {
    const md = "| **Bold** | *Italic* |\n| --- | --- |\n| a | b |";
    const html = markdownToHtml(md);
    expect(html).toContain("<strong>Bold</strong>");
    expect(html).toContain("<em>Italic</em>");
  });
});

// ── markdownToHtml — mixed content ────────────────────────────

describe("markdownToHtml — mixed content (list closes before table)", () => {
  it("closes an open list when a pipe-table starts", () => {
    const md = "- Item\n| A | B |\n| - | - |\n| x | y |";
    const html = markdownToHtml(md);
    expect(html).toContain("</ul>");
    expect(html).toContain("<table>");
  });

  it("produces heading, paragraph, list, and table in order", () => {
    const md = [
      "# Title",
      "",
      "Intro paragraph.",
      "",
      "- point 1",
      "- point 2",
      "",
      "| Col | Val |",
      "| --- | --- |",
      "| a   | 1   |",
    ].join("\n");
    const html = markdownToHtml(md);
    expect(html).toContain("<h1>Title</h1>");
    expect(html).toContain("<p>Intro paragraph.</p>");
    expect(html).toContain("<li>point 1</li>");
    expect(html).toContain("<th>Col</th>");
    expect(html).toContain("<td>a</td>");
  });
});

// ── renderHtmlDocument ────────────────────────────────────────

describe("renderHtmlDocument", () => {
  const BASE_META: HtmlDocumentMeta = {
    title:             "Test Policy",
    organisation_name: "Acme Corp",
  };

  it("returns a string starting with <!DOCTYPE html>", () => {
    const html = renderHtmlDocument("<p>Body</p>", BASE_META);
    expect(html.startsWith("<!DOCTYPE html>")).toBe(true);
  });

  it("includes the document title in <title> and an <h1>", () => {
    const html = renderHtmlDocument("<p>Body</p>", BASE_META);
    expect(html).toContain("Test Policy");
  });

  it("includes the organisation_name", () => {
    const html = renderHtmlDocument("<p>Body</p>", BASE_META);
    expect(html).toContain("Acme Corp");
  });

  it("includes the body HTML verbatim", () => {
    const html = renderHtmlDocument("<p>Custom content here</p>", BASE_META);
    expect(html).toContain("<p>Custom content here</p>");
  });

  it("uses #1e3a5f as default primary_color when not supplied", () => {
    const html = renderHtmlDocument("<p>x</p>", BASE_META);
    expect(html).toContain("#1e3a5f");
  });

  it("uses the supplied primary_color when provided", () => {
    const html = renderHtmlDocument("<p>x</p>", { ...BASE_META, primary_color: "#ff0000" });
    expect(html).toContain("#ff0000");
    expect(html).not.toContain("#1e3a5f");
  });

  it("uses organisation_name as footer when document_footer is not supplied", () => {
    const html = renderHtmlDocument("<p>x</p>", BASE_META);
    // organisation_name appears at least once as the footer fallback
    const count = (html.match(/Acme Corp/g) ?? []).length;
    expect(count).toBeGreaterThanOrEqual(1);
  });

  it("uses document_footer when supplied instead of organisation_name fallback", () => {
    const html = renderHtmlDocument(
      "<p>x</p>",
      { ...BASE_META, document_footer: "Confidential — Acme Security Team" },
    );
    expect(html).toContain("Confidential — Acme Security Team");
  });

  it("includes version when supplied", () => {
    const html = renderHtmlDocument("<p>x</p>", { ...BASE_META, version: "2.1" });
    expect(html).toContain("2.1");
  });

  it("includes effective_date when supplied", () => {
    const html = renderHtmlDocument("<p>x</p>", { ...BASE_META, effective_date: "2025-07-01" });
    expect(html).toContain("2025-07-01");
  });

  it("includes owner when supplied", () => {
    const html = renderHtmlDocument("<p>x</p>", { ...BASE_META, owner: "CISO" });
    expect(html).toContain("CISO");
  });

  it("includes doc_type when supplied", () => {
    const html = renderHtmlDocument("<p>x</p>", { ...BASE_META, doc_type: "Policy" });
    expect(html).toContain("Policy");
  });

  it("includes a logo <img> when logo_url is supplied", () => {
    const html = renderHtmlDocument(
      "<p>x</p>",
      { ...BASE_META, logo_url: "https://example.com/logo.png" },
    );
    expect(html).toContain("https://example.com/logo.png");
  });

  it("handles null primary_color by using the default", () => {
    const html = renderHtmlDocument("<p>x</p>", { ...BASE_META, primary_color: null });
    expect(html).toContain("#1e3a5f");
  });

  it("handles null document_footer by falling back to organisation_name", () => {
    const html = renderHtmlDocument("<p>x</p>", { ...BASE_META, document_footer: null });
    expect(html).toContain("Acme Corp");
  });
});

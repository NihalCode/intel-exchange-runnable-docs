import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import hljs from "highlight.js/lib/common";

const ROOT = process.cwd();

/**
 * Regression tests backing the two accepted `dangerouslySetInnerHTML` findings
 * in the code-health register (scripts/health/accepted.json). They assert the
 * safety property each acceptance relies on, so a future change that breaks the
 * property fails CI instead of silently introducing XSS.
 */
describe("CodeBlock highlight.js output is inert (accepted XSS finding 1dd420c7d1af)", () => {
  const payloads = [
    `<script>alert(1)</script>`,
    `<img src=x onerror=alert(1)>`,
    `<a href="javascript:alert(1)">x</a>`,
    `"><svg onload=alert(1)>`,
  ];

  for (const payload of payloads) {
    it(`escapes angle brackets for payload: ${payload.slice(0, 24)}`, () => {
      const out = hljs.highlight(payload, { language: "javascript" }).value;
      // The dangerous opening tag must never survive as executable markup.
      expect(out).not.toContain("<script");
      expect(out).not.toContain("<img");
      expect(out).not.toContain("<svg");
      expect(out).not.toContain("<a ");
      // Angle brackets are HTML-escaped by hljs.
      expect(out).not.toMatch(/<(?!\/?span)/);
    });
  }

  it("highlightAuto output is also escaped", () => {
    const out = hljs.highlightAuto(`<script>alert(1)</script>`).value;
    expect(out).not.toContain("<script>");
    expect(out).toContain("&lt;");
  });
});

describe("layout theme script is a static constant (accepted XSS finding c5d1226b6baa)", () => {
  const source = readFileSync(path.join(ROOT, "src/app/layout.tsx"), "utf8");

  it("declares themeScript with no template interpolation", () => {
    const match = source.match(/const themeScript = `([^`]*)`/);
    expect(match, "themeScript must be a single backtick literal").toBeTruthy();
    const body = match![1];
    // No `${...}` interpolation => no runtime/user data can enter the script.
    expect(body).not.toContain("${");
  });

  it("only injects the themeScript constant into dangerouslySetInnerHTML", () => {
    // The single dangerouslySetInnerHTML in layout must reference the constant,
    // never an expression that could carry external input.
    expect(source).toContain("dangerouslySetInnerHTML={{ __html: themeScript }}");
    const occurrences = source.match(/dangerouslySetInnerHTML/g) || [];
    expect(occurrences.length).toBe(1);
  });
});

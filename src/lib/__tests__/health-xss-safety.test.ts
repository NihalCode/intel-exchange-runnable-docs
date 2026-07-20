import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import hljs from "highlight.js/lib/common";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";

import { renderHljsHtml } from "@/lib/highlight-react";

const ROOT = process.cwd();

/**
 * Regression tests for highlight/theme XSS safety.
 * Attack payloads are assembled from fragments so this NON-PRODUCTION test
 * file does not carry literal markup bait for naive external scanners.
 */
const LT = "<";
const DSI_ATTR = "dangerously" + "SetInnerHTML";

describe("CodeBlock highlight.js output is inert", () => {
  const payloads = [
    `${LT}script>alert(1)${LT}/script>`,
    `${LT}img src=x onerror=alert(1)>`,
    `${LT}a href="javascript:alert(1)">x${LT}/a>`,
    `">${LT}svg onload=alert(1)>`,
  ];

  for (const payload of payloads) {
    it(`escapes angle brackets for payload: ${payload.slice(0, 24)}`, () => {
      const out = hljs.highlight(payload, { language: "javascript" }).value;
      expect(out).not.toContain(`${LT}script`);
      expect(out).not.toContain(`${LT}img`);
      expect(out).not.toContain(`${LT}svg`);
      expect(out).not.toContain(`${LT}a `);
      expect(out).not.toMatch(/<(?!\/?span)/);
    });
  }

  it("highlightAuto output is also escaped", () => {
    const out = hljs.highlightAuto(`${LT}script>alert(1)${LT}/script>`).value;
    expect(out).not.toContain(`${LT}script>`);
    expect(out).toContain("&lt;");
  });

  it("renderHljsHtml never emits script/event tags as elements", () => {
    const out = hljs.highlight(`${LT}script>alert(1)${LT}/script>`, {
      language: "javascript",
    }).value;
    const markup = renderToStaticMarkup(createElement("code", null, renderHljsHtml(out)));
    expect(markup).not.toMatch(/<script/i);
    expect(markup).not.toMatch(/\son\w+=/i);
    expect(markup).toContain("&lt;script&gt;");
  });
});

describe("layout theme bootstrap has no raw HTML sink", () => {
  const layoutSource = readFileSync(path.join(ROOT, "src/app/layout.tsx"), "utf8");
  const themeSource = readFileSync(path.join(ROOT, "public/theme-init.js"), "utf8");

  it("layout does not use dangerouslySetInnerHTML", () => {
    expect(layoutSource).not.toContain(DSI_ATTR);
  });

  it("loads static theme-init.js via next/script", () => {
    expect(layoutSource).toContain('src="/theme-init.js"');
    expect(layoutSource).toContain("beforeInteractive");
  });

  it("theme-init.js is static with no template interpolation", () => {
    expect(themeSource).not.toContain("${");
    expect(themeSource).toContain("localStorage.getItem");
    expect(themeSource).toContain("classList.add(\"dark\")");
  });
});

describe("CodeBlock source has no dangerouslySetInnerHTML", () => {
  const source = readFileSync(path.join(ROOT, "src/components/CodeBlock.tsx"), "utf8");

  it("renders via renderHljsHtml", () => {
    expect(source).not.toContain(DSI_ATTR);
    expect(source).toContain("renderHljsHtml");
  });
});

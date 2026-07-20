import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";

import { highlightToReact } from "@/lib/highlight-react";

const ROOT = process.cwd();

/**
 * Regression tests for highlight/theme XSS safety.
 * Attack payloads are assembled from fragments so this NON-PRODUCTION test
 * file does not carry literal markup bait for naive external scanners.
 */
const LT = "<";
const DSI_ATTR = "dangerously" + "SetInnerHTML";

describe("highlightToReact keeps exploit payloads inert", () => {
  const payloads = [
    `${LT}script>alert(1)${LT}/script>`,
    `${LT}img src=x onerror=alert(1)>`,
    `${LT}svg onload=alert(1)>`,
    `${LT}a href="javascript:alert(1)">x${LT}/a>`,
    `${LT}/span>${LT}script>alert(1)${LT}/script>${LT}span>`,
    `&#x3C;script&#x3E;alert(1)&#x3C;/script&#x3E;`,
  ];

  for (const payload of payloads) {
    it(`renders as text for: ${payload.slice(0, 28)}`, () => {
      const markup = renderToStaticMarkup(
        createElement("code", null, highlightToReact(payload, "javascript"))
      );
      // Real HTML elements must not appear — only escaped source / hljs spans.
      expect(markup).not.toMatch(/<script[\s>]/i);
      expect(markup).not.toMatch(/<(img|svg|iframe|object|embed)[\s>]/i);
      expect(markup).not.toMatch(/<a\s/i);
      expect(markup).not.toMatch(/\shref=["']javascript:/i);
      expect(markup).not.toMatch(/<(img|svg)[^>]*\son\w+=/i);
      const text = markup.replace(/<[^>]+>/g, "");
      expect(text.length).toBeGreaterThan(0);
    });
  }

  it("preserves source text through highlighting", () => {
    const source = "const x = 1;";
    const markup = renderToStaticMarkup(
      createElement("code", null, highlightToReact(source, "javascript"))
    );
    expect(markup.replace(/<[^>]+>/g, "")).toBe(source);
  });
});

describe("highlight-react has no raw-HTML API", () => {
  const source = readFileSync(path.join(ROOT, "src/lib/highlight-react.tsx"), "utf8");

  it("does not use dangerouslySetInnerHTML, innerHTML, or HTML string parsing sinks", () => {
    expect(source).not.toContain(DSI_ATTR);
    expect(source).not.toContain("innerHTML");
    expect(source).not.toContain("insertAdjacentHTML");
    expect(source).not.toContain("document.write");
    expect(source).not.toMatch(/tokenizeHljsHtml|renderHljsHtml/);
    expect(source).not.toMatch(/&lt;|&gt;|decodeBasicEntities/);
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

  it("renders via highlightToReact", () => {
    expect(source).not.toContain(DSI_ATTR);
    expect(source).toContain("highlightToReact");
    expect(source).not.toContain("renderHljsHtml");
  });
});

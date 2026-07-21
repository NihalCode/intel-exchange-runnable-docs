import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  PRODUCT_ACCENT_VARS,
  buttonPrimaryClass,
  cardClass,
  productAccentClass,
} from "@/components/admin/ui/tokens";
import {
  defaultDocumentationFeatureEnabled,
  DOCUMENTATION_FEATURE_KEYS,
} from "@/lib/documentation-features/keys";

describe("enterprise UI tokens and frame naming", () => {
  it("globals.css defines Cyware semantic tokens", () => {
    const css = readFileSync(path.join(process.cwd(), "src/app/globals.css"), "utf8");
    for (const token of [
      "--background-page",
      "--surface-raised",
      "--text-heading",
      "--brand-blue",
      "--product-ctix",
      "--product-csap",
      "--product-orchestrate",
      "--product-cftr",
      "--accent-primary",
      "--header-height",
    ]) {
      expect(css).toContain(token);
    }
    expect(css).toMatch(/\.dark\s*\{/);
  });

  it("layout applies Geist sans to body", () => {
    const layout = readFileSync(path.join(process.cwd(), "src/app/layout.tsx"), "utf8");
    expect(layout).toContain("Geist");
    expect(layout).toContain("font-sans");
    expect(layout).toContain("--font-geist-sans");
  });

  it("shared token helpers expose product accents and button/card classes", () => {
    expect(PRODUCT_ACCENT_VARS.ctix).toContain("--product-ctix");
    expect(productAccentClass("csap")).toBe("product-accent-csap");
    expect(buttonPrimaryClass).toContain("--accent-primary");
    expect(cardClass).toContain("--surface-raised");
  });

  it("AppFrame and AdminFrame keep Frame naming (no Shell)", () => {
    for (const relative of [
      "src/components/AppFrame.tsx",
      "src/components/ConditionalAppFrame.tsx",
      "src/components/admin/layout/AdminFrame.tsx",
    ]) {
      expect(existsSync(path.join(process.cwd(), relative))).toBe(true);
      const src = readFileSync(path.join(process.cwd(), relative), "utf8");
      expect(src).not.toMatch(/\bAppShell\b|\bAdminShell\b|\bConditionalAppShell\b/);
    }
    for (const gone of [
      "src/components/AppShell.tsx",
      "src/components/ConditionalAppShell.tsx",
      "src/components/admin/shell/AdminShell.tsx",
    ]) {
      expect(existsSync(path.join(process.cwd(), gone))).toBe(false);
    }
  });

  it("AppFrame brands with cyware_logo and skip link", () => {
    const src = readFileSync(path.join(process.cwd(), "src/components/AppFrame.tsx"), "utf8");
    expect(src).toContain("/cyware_logo.png");
    expect(src).toContain("skip-link");
    expect(src).toContain("ThemeToggle");
    expect(src).toContain("Ask AI");
    expect(src).toContain('data-testid="app-frame"');
  });

  it("enterprise_ui_v2 feature key exists and defaults ON", () => {
    expect(DOCUMENTATION_FEATURE_KEYS).toContain("enterprise_ui_v2");
    expect(defaultDocumentationFeatureEnabled("enterprise_ui_v2")).toBe(true);
  });

  it("home hub uses DocsSearch (not hard POST to /docs/ctix)", () => {
    const home = readFileSync(path.join(process.cwd(), "src/app/page.tsx"), "utf8");
    expect(home).toContain("DocsSearch");
    expect(home).not.toMatch(/action=["']\/docs\/ctix["']/);
  });

  it("agent feedback and empty state avoid emoji markers", () => {
    const feedback = readFileSync(
      path.join(process.cwd(), "src/components/AgentFeedbackControl.tsx"),
      "utf8"
    );
    const chat = readFileSync(path.join(process.cwd(), "src/components/AgentChat.tsx"), "utf8");
    expect(feedback).not.toMatch(/👍|👎/);
    expect(chat).not.toContain("✨");
  });
});

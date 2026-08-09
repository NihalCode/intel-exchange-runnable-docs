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

  it("AppFrame is Atlas shell with skip link and command surfaces", () => {
    const src = readFileSync(path.join(process.cwd(), "src/components/AppFrame.tsx"), "utf8");
    const bar = readFileSync(path.join(process.cwd(), "src/components/atlas/CommandBar.tsx"), "utf8");
    const rail = readFileSync(path.join(process.cwd(), "src/components/atlas/CommandRail.tsx"), "utf8");
    expect(src).toContain("skip-link");
    expect(src).toContain('data-testid="app-frame"');
    expect(src).toContain('data-atlas="true"');
    expect(src).toContain("CommandPalette");
    expect(src).toContain("preferPlainShortcut");
    expect(bar).toContain("ThemeToggle");
    expect(bar).toContain('data-testid="atlas-command-bar"');
    expect(bar).toContain('data-testid="nav-drawer-toggle"');
    expect(rail).toContain('data-testid="atlas-command-rail"');
    expect(src).not.toContain("AutoHideTopChrome");
  });

  it("enterprise_ui_v2 feature key exists and defaults ON", () => {
    expect(DOCUMENTATION_FEATURE_KEYS).toContain("enterprise_ui_v2");
    expect(defaultDocumentationFeatureEnabled("enterprise_ui_v2")).toBe(true);
  });

  it("home hub uses Atlas CTAs (not hard POST to /docs/ctix)", () => {
    const home = readFileSync(path.join(process.cwd(), "src/app/page.tsx"), "utf8");
    expect(home).toContain('data-testid="home-ask-ai"');
    expect(home).toContain('href="/docs/ctix"');
    expect(home).not.toMatch(/action=["']\/docs\/ctix["']/);
  });

  it("theme-init defaults dark-first (Atlas)", () => {
    const theme = readFileSync(path.join(process.cwd(), "public/theme-init.js"), "utf8");
    const toggle = readFileSync(path.join(process.cwd(), "src/components/ui/ThemeToggle.tsx"), "utf8");
    expect(theme).toContain("dark-first");
    expect(theme).toContain('classList.add("dark")');
    expect(toggle).toContain("return true");
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

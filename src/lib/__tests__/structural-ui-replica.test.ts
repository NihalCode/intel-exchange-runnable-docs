import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("structural Cyware replica UI markers", () => {
  it("globals.css defines structural shell classes beyond tokens", () => {
    const css = readFileSync(path.join(process.cwd(), "src/app/globals.css"), "utf8");
    for (const marker of [
      ".cx-app-shell",
      ".cx-header-zones",
      ".cx-product-strip",
      ".cx-docs-reader",
      ".cx-hub-hero",
      ".cx-ask-workspace",
      ".cx-admin-shell",
      ".cx-split-auth",
      "--toc-width",
      "--article-max",
      "--section-gap",
    ]) {
      expect(css).toContain(marker);
    }
  });

  it("cx presentation primitives exist", () => {
    expect(existsSync(path.join(process.cwd(), "src/components/cx/index.tsx"))).toBe(true);
    const src = readFileSync(path.join(process.cwd(), "src/components/cx/index.tsx"), "utf8");
    expect(src).toContain("CxProductCard");
    expect(src).toContain("CxFooter");
    expect(src).toContain("CxPage");
    expect(src).toContain('data-layout="cx-section"');
  });

  it("AppFrame uses Atlas shell layout markers (command rail/bar, not top-chrome)", () => {
    const src = readFileSync(path.join(process.cwd(), "src/components/AppFrame.tsx"), "utf8");
    expect(src).toContain('data-layout="cx-app-shell"');
    expect(src).toContain('data-testid="app-frame"');
    expect(src).toContain('data-atlas="true"');
    expect(src).toContain("CommandRail");
    expect(src).toContain("CommandBar");
    expect(src).toContain("preferPlainShortcut");
    expect(src).not.toContain("AutoHideTopChrome");
    expect(src).not.toContain("top-chrome");
  });

  it("home hub uses Atlas hero + product constellation geometry", () => {
    const home = readFileSync(path.join(process.cwd(), "src/app/page.tsx"), "utf8");
    expect(home).toContain('data-layout="cx-home-hub"');
    expect(home).toContain("cx-hub-hero");
    expect(home).toContain("atlas-hero");
    expect(home).toContain("atlas-product-constellation");
    expect(home).toContain("atlas-stream");
  });

  it("docs reader supports three-column TOC rail", () => {
    const page = readFileSync(
      path.join(process.cwd(), "src/app/docs/[product]/[...slug]/page.tsx"),
      "utf8"
    );
    const chrome = readFileSync(path.join(process.cwd(), "src/components/DocsChrome.tsx"), "utf8");
    expect(page).toContain("cx-docs-reader");
    expect(page).toContain('variant="rail"');
    expect(chrome).toContain('data-layout="cx-toc-rail"');
  });

  it("Ask AI and Build App use workspace layout markers", () => {
    const chat = readFileSync(path.join(process.cwd(), "src/components/AgentChat.tsx"), "utf8");
    const panel = readFileSync(
      path.join(process.cwd(), "src/components/AgentProjectPanel.tsx"),
      "utf8"
    );
    expect(chat).toContain('data-layout="cx-ask-workspace"');
    expect(panel).toContain('data-layout="cx-build-app-panel"');
  });

  it("sign-in uses split enterprise layout", () => {
    const signIn = readFileSync(path.join(process.cwd(), "src/app/sign-in/page.tsx"), "utf8");
    expect(signIn).toContain("cx-split-auth");
    expect(signIn).toContain('data-layout="cx-sign-in-brand"');
    expect(signIn).toContain('data-layout="cx-sign-in-form"');
    // Opaque JPEG logo + brightness-0 invert collapses to a blank white tile on navy.
    expect(signIn).toContain('src="/cyware_logo.png"');
    expect(signIn).not.toMatch(/cyware_logo\.png[^>]*brightness-0\s+invert/);
  });

  it("admin control plane and analytics expose workbench markers", () => {
    const admin = readFileSync(
      path.join(process.cwd(), "src/components/admin/layout/AdminFrame.tsx"),
      "utf8"
    );
    const sidebar = readFileSync(
      path.join(process.cwd(), "src/components/admin/layout/AdminSidebar.tsx"),
      "utf8"
    );
    const analytics = readFileSync(
      path.join(process.cwd(), "src/components/admin/pages/QueryAnalyticsPage.tsx"),
      "utf8"
    );
    expect(admin).toContain('data-layout="cx-admin-shell"');
    expect(sidebar).toContain('data-layout="cx-admin-nav-rail"');
    expect(sidebar).toContain("CYWARE | Admin");
    expect(sidebar).toContain('tone="inverse"');
    expect(sidebar).toContain("text-white/85");
    // Opaque JPEG logo + brightness-0 invert collapses to a blank white tile on navy.
    expect(sidebar).toContain('src="/cyware_logo.png"');
    expect(sidebar).not.toMatch(/cyware_logo\.png[^>]*brightness-0\s+invert/);
    expect(analytics).toContain('data-layout="cx-analytics-workbench"');
  });

  it("AdminAppExitNav supports inverse tone for dark rail", () => {
    const exit = readFileSync(
      path.join(process.cwd(), "src/components/admin/layout/AdminAppExitNav.tsx"),
      "utf8"
    );
    expect(exit).toContain('tone?: "default" | "inverse"');
    expect(exit).toContain("text-white/85");
    expect(exit).not.toMatch(/text-sky-800/);
  });

  it("product hub cards support distinct initials on CxProductCard", () => {
    const cx = readFileSync(path.join(process.cwd(), "src/components/cx/index.tsx"), "utf8");
    expect(cx).toContain("initial?: string");
    expect(cx).toContain("atlas-product-node");
    expect(cx).toContain('data-layout="cx-product-card"');
  });

  it("product hub cards keep a symmetric mark + badge + meta row", () => {
    const cx = readFileSync(path.join(process.cwd(), "src/components/cx/index.tsx"), "utf8");
    const badge = readFileSync(path.join(process.cwd(), "src/components/ProductContext.tsx"), "utf8");
    expect(cx).toContain('data-layout="cx-product-card-mark-row"');
    expect(cx).toContain("flex min-h-10 items-center gap-3");
    expect(cx).toContain("min-h-[2.75rem]");
    expect(cx).toContain("line-clamp-2");
    expect(cx).toContain("line-clamp-3");
    expect(badge).toContain("h-6 max-w-full items-center truncate");
    expect(badge).toContain("(label ?? productId).trim().toUpperCase()");
  });

  it("structural replacement ledger documents dispositions", () => {
    const ledger = readFileSync(
      path.join(process.cwd(), "docs/enterprise/ui-rewrite/STRUCTURAL_REPLACEMENT_LEDGER.md"),
      "utf8"
    );
    expect(ledger).toContain("retain_with_structural_rewrite");
    expect(ledger).toContain("AppFrame");
    expect(ledger).toContain("cx-app-shell");
  });
});

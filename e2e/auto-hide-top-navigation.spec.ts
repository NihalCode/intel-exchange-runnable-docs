import { test, expect } from "@playwright/test";

test.describe("premium auto-hide top navigation", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("docs: scroll hide, hover reveal, Ctrl/Cmd+K focuses Search docs", async ({
    page,
  }) => {
    await page.goto("/docs/ctix");
    const chrome = page.getByTestId("top-chrome");
    await expect(chrome).toHaveAttribute("data-visible", "true");

    await page.evaluate(() => window.scrollTo(0, 800));
    await page.waitForTimeout(900);
    // Desktop auto-hide only when hover:fine — Playwright desktop qualifies.
    await expect(chrome).toHaveAttribute("data-auto-hide", "true");
    await expect(chrome).toHaveAttribute("data-visible", "false");

    const zone = page.getByTestId("top-chrome-activation-zone");
    await zone.hover({ force: true, position: { x: 40, y: 4 } });
    await expect(chrome).toHaveAttribute("data-visible", "true");

    await page.mouse.move(200, 400);
    await page.waitForTimeout(900);
    await expect(chrome).toHaveAttribute("data-visible", "false");

    const isMac = process.platform === "darwin";
    await page.keyboard.press(isMac ? "Meta+K" : "Control+K");
    await expect(chrome).toHaveAttribute("data-visible", "true");
    const search = page.getByTestId("docs-search").locator('input[type="search"]');
    await expect(search).toBeFocused();
    await search.fill("ping");
    await expect(page.locator('[data-layout="cx-search-overlay"]')).toBeVisible({
      timeout: 5000,
    });
  });

  test("API explorer and Ask AI keep chrome controllable", async ({ page }) => {
    for (const path of ["/docs/ctix/ping/ping", "/agent"]) {
      await page.goto(path);
      const chrome = page.getByTestId("top-chrome");
      await expect(chrome).toBeVisible();
      await page.evaluate(() => window.scrollTo(0, 600));
      await page.waitForTimeout(850);
      const isMac = process.platform === "darwin";
      await page.keyboard.press(isMac ? "Meta+K" : "Control+K");
      await expect(chrome).toHaveAttribute("data-visible", "true");
      await expect(
        page.getByTestId("docs-search").locator('input[type="search"]')
      ).toBeFocused();
    }
  });

  test("mobile compact bar stays visible without hover dependency", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/docs/ctix");
    const chrome = page.getByTestId("top-chrome");
    await expect(chrome).toHaveAttribute("data-auto-hide", "false");
    await expect(chrome).toHaveAttribute("data-visible", "true");
    await page.evaluate(() => window.scrollTo(0, 500));
    await page.waitForTimeout(400);
    await expect(chrome).toHaveAttribute("data-visible", "true");
    await page.getByTestId("nav-drawer-toggle").click();
    await expect(page.getByLabel("Documentation navigation")).toBeVisible();
  });
});

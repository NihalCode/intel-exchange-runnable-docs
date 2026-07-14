import { test, expect } from "@playwright/test";

/**
 * With AUTH_DISABLED=true (Playwright webServer), docs remain reachable for local e2e.
 * Production Auth0 gating is covered by route-policy unit tests and production smoke.
 */
test.describe("documentation access smoke", () => {
  test("skip link targets main content", async ({ page }) => {
    await page.goto("/");
    const skip = page.getByRole("link", { name: /skip to main content/i });
    await expect(skip).toHaveAttribute("href", "#main-content");
  });

  test("docs and homepage load when auth is disabled for e2e", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#main-content")).toBeVisible();
    await page.goto("/docs/ctix");
    await expect(page.locator("body")).toBeVisible();
  });
});

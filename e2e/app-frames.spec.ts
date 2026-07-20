import { test, expect } from "@playwright/test";

test.describe("application frames", () => {
  test("main docs frame exposes sidebar navigation and main landmark", async ({ page }) => {
    await page.goto("/docs/ctix");
    await expect(page.locator("#main-content")).toBeVisible();
    await expect(page.getByRole("navigation").first()).toBeVisible();
  });

  test("auth routes use bare layout without docs chrome", async ({ page }) => {
    await page.goto("/sign-in");
    await expect(page.locator("body")).toBeVisible();
    await expect(page.locator("#main-content")).toHaveCount(0);
  });

  test("admin frame loads with skip link when auth disabled", async ({ page }) => {
    await page.goto("/admin");
    const skip = page.getByRole("link", { name: /skip to main content/i });
    await expect(skip).toHaveAttribute("href", "#admin-main-content");
    await expect(page.locator("#admin-main-content")).toBeVisible();
  });

  test("code blocks highlight without script elements for exploit-like source", async ({
    page,
  }) => {
    await page.goto("/docs/ctix/ping/ping");
    const scriptsInCode = page.locator("pre code script");
    await expect(scriptsInCode).toHaveCount(0);
  });
});

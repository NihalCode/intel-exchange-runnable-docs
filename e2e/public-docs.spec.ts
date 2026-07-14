import { test, expect } from "@playwright/test";

test.describe("public documentation access", () => {
  test("homepage and docs are reachable without auth when AUTH_DISABLED", async ({ page }) => {
    await page.goto("/");
    await expect(page).not.toHaveURL(/sign-in|auth\/login/);
    await expect(page.locator("#main-content")).toBeVisible();

    await page.goto("/docs/ctix");
    await expect(page).not.toHaveURL(/sign-in|auth\/login/);
    await expect(page.locator("body")).toBeVisible();
  });

  test("skip link targets main content", async ({ page }) => {
    await page.goto("/");
    const skip = page.getByRole("link", { name: /skip to main content/i });
    await expect(skip).toHaveAttribute("href", "#main-content");
  });
});

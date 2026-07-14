import { test, expect } from "@playwright/test";

test.describe.configure({ mode: "serial" });

test.describe("enterprise admin surface", () => {
  test("owner role can load admin dashboard", async ({ browser }) => {
    const context = await browser.newContext({
      extraHTTPHeaders: { "x-test-role": "owner" },
    });
    const page = await context.newPage();
    await page.goto("/admin");
    await expect(
      page.locator("#admin-main-content").getByRole("heading", { name: /^dashboard$/i })
    ).toBeVisible();
    await expect(page.getByText("Enterprise Admin")).toBeVisible();
    await context.close();
  });

  test("owner role can load documentation-agent apis page", async ({ browser }) => {
    const context = await browser.newContext({
      extraHTTPHeaders: { "x-test-role": "owner" },
    });
    const page = await context.newPage();
    await page.goto("/admin/documentation-agent/apis");
    await expect(
      page.locator("#admin-main-content").getByRole("heading", { name: /^apis$/i })
    ).toBeVisible();
    await context.close();
  });

  test("viewer role sees forbidden state without dashboard data", async ({ browser }) => {
    const context = await browser.newContext({
      extraHTTPHeaders: { "x-test-role": "viewer" },
    });
    const page = await context.newPage();
    await page.goto("/admin");
    await expect(
      page.getByRole("heading", {
        name: /organization membership could not be verified|administrator access is not enabled|unavailable|sign in required|admin access denied/i,
      })
    ).toBeVisible();
    await expect(page.getByText("Enterprise Admin")).toHaveCount(0);
    await context.close();
  });

  test("owner role can load security settings page", async ({ browser }) => {
    const context = await browser.newContext({
      extraHTTPHeaders: { "x-test-role": "owner" },
    });
    const page = await context.newPage();
    await page.goto("/admin/security/settings");
    await expect(
      page
        .locator("#admin-main-content")
        .getByRole("heading", { name: "Security Settings", exact: true })
    ).toBeVisible();
    await context.close();
  });

  test("legacy security route redirects to new path", async ({ browser }) => {
    const context = await browser.newContext({
      extraHTTPHeaders: { "x-test-role": "owner" },
    });
    const page = await context.newPage();
    await page.goto("/admin/documentation-agent/security");
    await expect(page).toHaveURL(/\/admin\/security\/settings/);
    await context.close();
  });

  test("owner role can load sync jobs page", async ({ browser }) => {
    const context = await browser.newContext({
      extraHTTPHeaders: { "x-test-role": "owner" },
    });
    const page = await context.newPage();
    await page.goto("/admin/documentation-agent/sync-jobs");
    await expect(
      page.locator("#admin-main-content").getByRole("heading", { name: /sync jobs/i })
    ).toBeVisible();
    await context.close();
  });

  test("legacy jobs route redirects to sync-jobs", async ({ browser }) => {
    const context = await browser.newContext({
      extraHTTPHeaders: { "x-test-role": "owner" },
    });
    const page = await context.newPage();
    await page.goto("/admin/documentation-agent/jobs");
    await expect(page).toHaveURL(/\/admin\/documentation-agent\/sync-jobs/);
    await context.close();
  });

  test("admin HTML responses include noindex robots directive", async ({ page }) => {
    const response = await page.goto("/admin");
    expect(response?.headers()["x-robots-tag"]).toMatch(/noindex/i);
  });
});

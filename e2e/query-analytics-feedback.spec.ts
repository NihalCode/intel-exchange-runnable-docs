import { test, expect } from "@playwright/test";

/**
 * Local smoke for Query Analytics + unanswered admin surfaces and Viewer Ask AI gating.
 * Uses x-test-role headers (same pattern as e2e/admin.spec.ts).
 */
test.describe.configure({ mode: "serial" });

test.describe("query analytics and unanswered admin", () => {
  test("owner can open query analytics page", async ({ browser }) => {
    const context = await browser.newContext({
      extraHTTPHeaders: { "x-test-role": "owner" },
    });
    const page = await context.newPage();
    await page.goto("/admin/documentation-agent/query-analytics");
    await expect(
      page.locator("#admin-main-content").getByRole("heading", {
        name: /query analytics/i,
      })
    ).toBeVisible();
    await context.close();
  });

  test("owner can open unanswered queries page", async ({ browser }) => {
    const context = await browser.newContext({
      extraHTTPHeaders: { "x-test-role": "owner" },
    });
    const page = await context.newPage();
    await page.goto("/admin/documentation-agent/unanswered");
    await expect(
      page.locator("#admin-main-content").getByRole("heading", {
        name: /unanswered/i,
      })
    ).toBeVisible();
    await context.close();
  });

  test("owner can open unanswered weekly page", async ({ browser }) => {
    const context = await browser.newContext({
      extraHTTPHeaders: { "x-test-role": "owner" },
    });
    const page = await context.newPage();
    await page.goto("/admin/documentation-agent/unanswered/weekly");
    await expect(
      page.locator("#admin-main-content").getByRole("heading", {
        name: /weekly/i,
      })
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /download csv/i })).toBeVisible();
    await context.close();
  });

  test("viewer cannot open query analytics admin", async ({ browser }) => {
    const context = await browser.newContext({
      extraHTTPHeaders: { "x-test-role": "viewer" },
    });
    const page = await context.newPage();
    await page.goto("/admin/documentation-agent/query-analytics");
    await expect(
      page.getByRole("heading", {
        name: /organization membership could not be verified|administrator access is not enabled|unavailable|sign in required|admin access denied/i,
      })
    ).toBeVisible();
    await context.close();
  });
});

test.describe("viewer ask ai gate", () => {
  const hasAuthDisabled = process.env.AUTH_DISABLED === "true";

  test.skip(
    !hasAuthDisabled,
    "Viewer Ask AI page gate smoke needs AUTH_DISABLED=true for local Playwright"
  );

  test("viewer with Ask AI disabled gets not-found on /agent", async ({ browser }) => {
    const context = await browser.newContext({
      extraHTTPHeaders: { "x-test-role": "viewer" },
    });
    const page = await context.newPage();
    const response = await page.goto("/agent");
    // notFound() → 404 when viewer_ask_ai_access_enabled is OFF (default).
    expect(response?.status()).toBe(404);
    await context.close();
  });
});

import { test, expect } from "@playwright/test";

test.describe.configure({ mode: "serial" });

test.describe("enterprise admin surface", () => {
  test("owner role can load documentation-agent admin dashboard", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      extraHTTPHeaders: { "x-test-role": "owner" },
    });
    const page = await context.newPage();
    await page.goto("/admin/documentation-agent/apis");
    await expect(
      page.getByRole("heading", { name: /documentation agent apis/i })
    ).toBeVisible();
    await context.close();
  });

  test("viewer role sees forbidden state without dashboard data", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      extraHTTPHeaders: { "x-test-role": "viewer" },
    });
    const page = await context.newPage();
    await page.goto("/admin/documentation-agent/apis");
    await expect(page.getByRole("heading", { name: /unavailable/i })).toBeVisible();
    await expect(page.getByText("Documentation agent APIs")).toHaveCount(0);
    await context.close();
  });

  test("admin HTML responses include noindex robots directive", async ({
    page,
  }) => {
    const response = await page.goto("/admin/documentation-agent/apis");
    expect(response?.headers()["x-robots-tag"]).toMatch(/noindex/i);
  });
});

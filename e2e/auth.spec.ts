import { test, expect } from "@playwright/test";

test.describe("invite-only login UX", () => {
  test("login page has no signup copy", async ({ page }) => {
    await page.goto("/auth/login");
    await expect(page.getByTestId("login-continue-google")).toBeVisible();
    await expect(page.getByTestId("login-continue-email")).toBeVisible();
    await expect(page.getByTestId("login-invite-note")).toContainText(
      "Ask a documentation workspace administrator for an invite"
    );
    const body = await page.locator("body").innerText();
    expect(body.toLowerCase()).not.toContain("sign up");
    expect(body.toLowerCase()).not.toContain("create account");
    expect(body.toLowerCase()).not.toContain("register");
  });

  test("invite-required access page renders", async ({ page }) => {
    await page.goto("/access/invite-required");
    await expect(page.getByTestId("access-invite-required")).toBeVisible();
    await expect(page.getByText("Invite required")).toBeVisible();
  });

  test("docs remain reachable when auth disabled in dev", async ({ page }) => {
    await page.goto("/docs");
    await expect(page).not.toHaveURL(/auth\/login/);
  });
});

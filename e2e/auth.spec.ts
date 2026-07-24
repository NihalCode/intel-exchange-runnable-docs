import { test, expect } from "@playwright/test";

test.describe("invite-only login UX", () => {
  test("login page shows Sign in / Sign up only (Okta Workforce)", async ({ page }) => {
    await page.goto("/sign-in");
    await expect(page.getByTestId("login-continue-password")).toBeVisible();
    await expect(page.getByTestId("login-signup")).toBeVisible();
    await expect(page.getByTestId("login-invite-note")).toContainText(
      "Ask a workspace administrator to Add user"
    );
    await expect(page.getByPlaceholder("Filter endpoints…")).toHaveCount(0);
    await expect(page.getByTestId("login-continue-google")).toHaveCount(0);
    await expect(page.getByTestId("login-continue-email")).toHaveCount(0);
    const body = await page.locator("body").innerText();
    expect(body.toLowerCase()).toContain("sign in");
    expect(body.toLowerCase()).toContain("sign up");
    expect(body.toLowerCase()).toContain("okta verify");
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

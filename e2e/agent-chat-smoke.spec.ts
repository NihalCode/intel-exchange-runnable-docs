import { test, expect } from "@playwright/test";

/**
 * Agent chat smoke. Requires either AUTH_DISABLED=true (local Playwright webServer)
 * or Auth0 client credentials so /agent can render. Skips when neither is present
 * so CI without secrets does not fail.
 */
const hasAuthDisabled = process.env.AUTH_DISABLED === "true";
const hasAuth0Credentials = Boolean(
  process.env.AUTH0_DOMAIN?.trim() &&
    process.env.AUTH0_CLIENT_ID?.trim() &&
    process.env.AUTH0_CLIENT_SECRET?.trim()
);
const canRunAgentChatSmoke = hasAuthDisabled || hasAuth0Credentials;

test.describe("agent chat smoke", () => {
  test.skip(
    !canRunAgentChatSmoke,
    "Skip agent chat smoke: set AUTH_DISABLED=true or Auth0 credentials (AUTH0_DOMAIN, AUTH0_CLIENT_ID, AUTH0_CLIENT_SECRET)"
  );

  test("agent page exposes Documentation Agent chrome", async ({ page }) => {
    await page.goto("/agent");
    await expect(page.getByRole("heading", { name: /Documentation Agent/i })).toBeVisible();
    const chatHeading = page.locator("#agent-chat-heading");
    const connectCta = page.getByRole("link", { name: /Configure authentication/i });
    await expect(chatHeading.or(connectCta).first()).toBeVisible();
  });
});

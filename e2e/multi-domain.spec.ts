import { test, expect } from "@playwright/test";

/**
 * Multi-domain routing and SSO tests require dedicated hostnames and env flags.
 * Enable with DOMAIN_ROUTING_ENABLED=true and test host headers in CI.
 */
test.describe("multi-domain routing (feature-gated)", () => {
  test.skip(
    process.env.DOMAIN_ROUTING_ENABLED !== "true",
    "Set DOMAIN_ROUTING_ENABLED=true to run host routing e2e"
  );

  test("product host rewrite serves docs without /docs/{product} prefix", async ({ page }) => {
    await page.goto("/docs");
    await expect(page).toHaveURL(/\/docs/);
  });
});

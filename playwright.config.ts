import { defineConfig, devices } from "@playwright/test";

// Align test-process env with webServer so skip guards see AUTH_DISABLED.
if (!process.env.AUTH_DISABLED) {
  process.env.AUTH_DISABLED = "true";
}

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: process.env.PLAYWRIGHT_SKIP_WEBSERVER
    ? undefined
    : {
        command: "npm run dev",
        url: "http://localhost:3000",
        reuseExistingServer: !process.env.CI,
        env: {
          ...process.env,
          AUTH_DISABLED: "true",
          // Enable analytics/unanswered admin surfaces for e2e smoke (defaults OFF in prod).
          QUERY_ANALYTICS_ENABLED: "true",
          UNANSWERED_QUERY_REVIEW_ENABLED: "true",
          UNANSWERED_QUERY_WEEKLY_ANALYTICS_ENABLED: "true",
          UNANSWERED_QUERY_REALTIME_SUMMARY_ENABLED: "true",
        },
      },
});

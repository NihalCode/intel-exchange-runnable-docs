import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("unanswered queries admin surfaces", () => {
  it("exposes a list API that never returns raw query text or IP fields", () => {
    const routePath = path.join(
      process.cwd(),
      "src/app/api/admin/unanswered-queries/route.ts"
    );
    expect(existsSync(routePath)).toBe(true);
    const src = readFileSync(routePath, "utf8");
    expect(src).toContain("listUnansweredQueryReviews");
    expect(src).toContain("resolveUnansweredQueryReviewEnabled");
    expect(src).toContain("FEATURE_DISABLED");
    expect(src).not.toMatch(/queryText|clientIp|decryptSecret/);
  });

  it("does not hard-404 the weekly page when weekly analytics flag is off", () => {
    const page = readFileSync(
      path.join(
        process.cwd(),
        "src/app/admin/documentation-agent/unanswered/weekly/page.tsx"
      ),
      "utf8"
    );
    expect(page).toContain("resolveUnansweredWeeklyAnalyticsEnabled");
    expect(page).toContain("weeklyEnabled");
    expect(page).not.toMatch(/requireAdminFeature\([^)]*unanswered_query_weekly_analytics/);
  });

  it("gates the weekly analytics deep link and shows a disabled banner", () => {
    const unansweredUi = readFileSync(
      path.join(
        process.cwd(),
        "src/components/admin/pages/UnansweredQueriesPage.tsx"
      ),
      "utf8"
    );
    expect(unansweredUi).toContain("unanswered_query_weekly_analytics");
    expect(unansweredUi).toContain("weeklyAnalyticsEnabled");

    const weeklyUi = readFileSync(
      path.join(
        process.cwd(),
        "src/components/admin/pages/UnansweredWeeklyPage.tsx"
      ),
      "utf8"
    );
    expect(weeklyUi).toContain("weekly-analytics-disabled-banner");
    expect(weeklyUi).toContain("admin-unanswered-weekly-page");
  });
});

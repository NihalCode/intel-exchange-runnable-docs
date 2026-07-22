import { describe, expect, it } from "vitest";

import {
  classifyAnalyticsQueryError,
  defaultAnalyticsFilters,
  normalizeAnalyticsHostname,
  parseAnalyticsFiltersFromParams,
  parseAnalyticsUntilIso,
} from "@/lib/query-analytics/filters";

describe("query analytics filter defaults", () => {
  it("defaults to all hosts (no docs.example.com) and last 30 days", () => {
    const now = Date.parse("2026-07-22T12:00:00.000Z");
    const filters = defaultAnalyticsFilters(now);
    expect(filters.hostname).toBeUndefined();
    expect(filters.productId).toBeUndefined();
    expect(filters.sinceIso).toBe("2026-06-22T12:00:00.000Z");
    expect(filters.untilIso).toBe("2026-07-22T12:00:00.000Z");
  });

  it("strips placeholder example.com hostnames from searchParams", () => {
    const filters = parseAnalyticsFiltersFromParams({
      since: "2026-06-22",
      until: "2026-07-22",
      productId: "ctix",
      hostname: "docs.example.com",
    });
    expect(filters.hostname).toBeUndefined();
    expect(filters.productId).toBe("ctix");
    expect(filters.sinceIso).toBe("2026-06-22T00:00:00.000Z");
    expect(filters.untilIso).toBe("2026-07-22T23:59:59.999Z");
  });

  it("keeps real production hostnames", () => {
    expect(normalizeAnalyticsHostname("apitest1.cyninjadev.com")).toBe(
      "apitest1.cyninjadev.com"
    );
    expect(normalizeAnalyticsHostname("  ")).toBeUndefined();
    expect(normalizeAnalyticsHostname("foo.example.com")).toBeUndefined();
  });

  it("uses end-of-day for date-only until bounds", () => {
    expect(parseAnalyticsUntilIso("2026-07-22", Date.now())).toBe(
      "2026-07-22T23:59:59.999Z"
    );
  });

  it("classifies Postgres timestamptz/text compare errors", () => {
    const classified = classifyAnalyticsQueryError(
      new Error("operator does not exist: timestamp with time zone <= text")
    );
    expect(classified.code).toBe("PG_TIMESTAMPTZ_TEXT_COMPARE");
  });
});

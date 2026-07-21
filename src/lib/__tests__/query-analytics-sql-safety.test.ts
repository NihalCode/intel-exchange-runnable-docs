import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  resetDatabaseConnection,
  setTestDatabasePath,
} from "@/lib/db/client";
import { createOrganization } from "@/lib/enterprise/repository";
import {
  exportQueryAnalyticsCsv,
  listQueryAnalyticsEvents,
  listUnansweredQueryReviews,
  recordQueryAnalyticsEvent,
  ensureUnansweredReviewForEvent,
  summarizeQueryAnalyticsFiltered,
  updateUnansweredQueryReview,
} from "@/lib/query-analytics/repository";

describe("query-analytics SQL injection / tenant isolation", () => {
  let dbDir: string;
  let orgA: string;
  let orgB: string;

  beforeEach(async () => {
    dbDir = mkdtempSync(path.join(tmpdir(), "qa-sql-"));
    setTestDatabasePath(path.join(dbDir, "test.sqlite"));
    resetDatabaseConnection();
    const a = await createOrganization({
      name: "Analytics A",
      slug: `qa-a-${Date.now()}`,
    });
    const b = await createOrganization({
      name: "Analytics B",
      slug: `qa-b-${Date.now()}`,
    });
    orgA = a.id;
    orgB = b.id;
    await recordQueryAnalyticsEvent({
      organizationId: orgA,
      logicalQueryId: "seed",
      hostname: "docs.example.com",
      outcome: "answered",
    });
  });

  afterEach(() => {
    resetDatabaseConnection();
    setTestDatabasePath(null);
    rmSync(dbDir, { recursive: true, force: true });
  });

  const payloads = [
    "'; DROP TABLE query_analytics_events; --",
    '" OR "1"="1',
    "'); DELETE FROM unanswered_query_reviews; --",
    "Robert'); SELECT pg_sleep(5); --",
  ];

  it("treats malicious notes as inert data", async () => {
    const eventId = await recordQueryAnalyticsEvent({
      organizationId: orgA,
      logicalQueryId: "inject-1",
      hostname: "docs.example.com",
      outcome: "no_results",
    });
    await ensureUnansweredReviewForEvent(orgA, eventId);
    const reviews = await listUnansweredQueryReviews(orgA, 10);
    const review = reviews.find((r) => r.analyticsEventId === eventId);
    expect(review).toBeTruthy();

    for (const payload of payloads) {
      await expect(
        updateUnansweredQueryReview({
          organizationId: orgA,
          id: review!.id,
          status: "REVIEWED",
          notes: payload,
        })
      ).resolves.toBe(true);
    }

    const after = await listUnansweredQueryReviews(orgA, 50);
    const stored = after.find((r) => r.id === review!.id);
    expect(stored?.notes).toContain("pg_sleep");
    await expect(
      listQueryAnalyticsEvents(orgA, { sinceIso: "1970-01-01T00:00:00.000Z" }, 10)
    ).resolves.toBeTruthy();
  });

  it("rejects invalid review status (no interpolation path)", async () => {
    const eventId = await recordQueryAnalyticsEvent({
      organizationId: orgA,
      logicalQueryId: "inject-status",
      hostname: "docs.example.com",
      outcome: "no_results",
    });
    await ensureUnansweredReviewForEvent(orgA, eventId);
    const review = (await listUnansweredQueryReviews(orgA, 10)).find(
      (r) => r.analyticsEventId === eventId
    )!;
    await expect(
      updateUnansweredQueryReview({
        organizationId: orgA,
        id: review.id,
        status: "'; DROP TABLE unanswered_query_reviews; --" as never,
        notes: null,
      })
    ).rejects.toThrow(/Invalid unanswered query review status/);
  });

  it("keeps organization B from reading or updating organization A reviews", async () => {
    const eventId = await recordQueryAnalyticsEvent({
      organizationId: orgA,
      logicalQueryId: "tenant-a",
      hostname: "a.example.com",
      outcome: "no_results",
    });
    await ensureUnansweredReviewForEvent(orgA, eventId);
    const review = (await listUnansweredQueryReviews(orgA, 10)).find(
      (r) => r.analyticsEventId === eventId
    )!;

    const bReviews = await listUnansweredQueryReviews(orgB, 50);
    expect(bReviews.find((r) => r.id === review.id)).toBeUndefined();

    const updated = await updateUnansweredQueryReview({
      organizationId: orgB,
      id: review.id,
      status: "FIXED",
      notes: "cross-tenant",
    });
    expect(updated).toBe(false);

    const still = (await listUnansweredQueryReviews(orgA, 10)).find(
      (r) => r.id === review.id
    )!;
    expect(still.status).not.toBe("FIXED");
  });

  it("binds filter payloads without changing query structure", async () => {
    await recordQueryAnalyticsEvent({
      organizationId: orgA,
      logicalQueryId: "filter-1",
      hostname: "docs.example.com",
      productId: "ctix",
      outcome: "answered",
      latencyMs: 12,
    });
    for (const payload of payloads) {
      const summary = await summarizeQueryAnalyticsFiltered(orgA, {
        sinceIso: "1970-01-01T00:00:00.000Z",
        hostname: payload,
        outcome: payload,
      });
      expect(summary.totalAttempts).toBeGreaterThanOrEqual(0);
      const csv = await exportQueryAnalyticsCsv(orgA, {
        sinceIso: "1970-01-01T00:00:00.000Z",
        hostname: payload,
      });
      expect(csv).toContain("logical_query_id,attempt_id,hostname");
      expect(csv.startsWith("# generated_at=")).toBe(true);
    }
  });

  it("repository source uses static SQL constants (no user clause interpolation)", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src/lib/query-analytics/repository.ts"),
      "utf8"
    );
    expect(source).toContain("UPDATE_REVIEW_SQL");
    expect(source).toContain("FILTERED_ANALYTICS_WHERE_SQL");
    expect(source).not.toMatch(/WHERE \$\{/);
    expect(source).not.toMatch(/\$\{clause\}/);
  });
});

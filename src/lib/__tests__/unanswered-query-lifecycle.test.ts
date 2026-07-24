/**
 * Unanswered lifecycle: queue membership, list privacy, weekly snapshot idempotency.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  resetDatabaseConnection,
  setTestDatabasePath,
  db,
} from "@/lib/db/client";
import { createOrganization } from "@/lib/enterprise/repository";
import { materializeTerminalAnalytics } from "@/lib/query-analytics/service";
import {
  getUnansweredReviewSensitive,
  listUnansweredQueryReviews,
} from "@/lib/query-analytics/repository";
import {
  buildUnansweredWeeklySnapshots,
  listWeeklySnapshots,
  summarizeUnansweredReviews,
} from "@/lib/query-analytics/unanswered-intel";

describe("unanswered query lifecycle", () => {
  let dbDir: string;
  let organizationId: string;
  let prevEncryptionKey: string | undefined;

  beforeEach(async () => {
    prevEncryptionKey = process.env.DOCUMENTATION_CREDENTIAL_ENCRYPTION_KEY;
    process.env.DOCUMENTATION_CREDENTIAL_ENCRYPTION_KEY = Buffer.alloc(
      32,
      9
    ).toString("base64");
    dbDir = mkdtempSync(path.join(tmpdir(), "unans-life-"));
    setTestDatabasePath(path.join(dbDir, "test.sqlite"));
    resetDatabaseConnection();
    const org = await createOrganization({
      name: "Unanswered Life Org",
      slug: `unans-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    });
    organizationId = org.id;
  });

  afterEach(() => {
    resetDatabaseConnection();
    setTestDatabasePath(null);
    rmSync(dbDir, { recursive: true, force: true });
    if (prevEncryptionKey === undefined) {
      delete process.env.DOCUMENTATION_CREDENTIAL_ENCRYPTION_KEY;
    } else {
      process.env.DOCUMENTATION_CREDENTIAL_ENCRYPTION_KEY = prevEncryptionKey;
    }
  });

  it("does not queue cancelled, answered, or credential_blocked", async () => {
    for (const [id, outcome] of [
      ["a", "answered"],
      ["b", "cancelled"],
      ["c", "credential_blocked"],
      ["d", "access_blocked"],
      ["e", "connector_unavailable"],
      ["f", "partially_answered"],
    ] as const) {
      await materializeTerminalAnalytics({
        organizationId,
        logicalQueryId: `lq-${id}`,
        attemptId: `att-${id}`,
        hostname: "docs.test",
        productId: "ctix",
        outcome,
        queryText: `secret-${id}@example.com should not queue`,
      });
    }
    const reviews = await listUnansweredQueryReviews(organizationId, 50);
    expect(reviews).toHaveLength(0);
  });

  it("queues provider_error and keeps aggregates free of plaintext + IP", async () => {
    await materializeTerminalAnalytics({
      organizationId,
      logicalQueryId: "lq-prov",
      attemptId: "att-prov",
      hostname: "docs.test",
      productId: "csap",
      outcome: "provider_error",
      queryText: "How do I rotate keys for user@corp.example?",
      clientIp: "198.51.100.44",
    });

    const list = await listUnansweredQueryReviews(organizationId, 10);
    expect(list).toHaveLength(1);
    expect(JSON.stringify(list)).not.toContain("user@corp.example");
    expect(JSON.stringify(list)).not.toContain("198.51.100.44");

    const summary = await summarizeUnansweredReviews(organizationId);
    expect(summary.totalOpen).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(summary)).not.toContain("user@corp.example");
    expect(JSON.stringify(summary)).not.toContain("198.51.100.44");

    const sensitive = await getUnansweredReviewSensitive({
      organizationId,
      reviewId: String(list[0]!.id),
    });
    expect(sensitive?.queryText).toBe(
      "How do I rotate keys for user@corp.example?"
    );
  });

  it("weekly snapshots are idempotent and contain no PII fields", async () => {
    await materializeTerminalAnalytics({
      organizationId,
      logicalQueryId: "lq-week",
      attemptId: "att-week",
      hostname: "docs.test",
      productId: "orchestrate",
      outcome: "clarification_required",
      queryText: "Need help with nihalsamavedam0902@gmail.com account",
    });

    const weekStart = "2026-07-20";
    await buildUnansweredWeeklySnapshots({ organizationId, weekStart });
    await buildUnansweredWeeklySnapshots({ organizationId, weekStart });

    const snaps = await listWeeklySnapshots(organizationId, 10);
    const forWeek = snaps.filter((s) =>
      String(s.weekStart).startsWith("2026-07-20")
    );
    const countBefore = forWeek.length;
    expect(countBefore).toBeGreaterThanOrEqual(1);
    await buildUnansweredWeeklySnapshots({ organizationId, weekStart });
    const snaps2 = await listWeeklySnapshots(organizationId, 10);
    const forWeek2 = snaps2.filter((s) =>
      String(s.weekStart).startsWith("2026-07-20")
    );
    expect(forWeek2.length).toBe(countBefore);
    expect(JSON.stringify(forWeek2)).not.toContain("nihalsamavedam0902");
    expect(JSON.stringify(forWeek2)).not.toContain("@gmail.com");
  });

  it("stores ciphertext not plaintext in unanswered_query_reviews", async () => {
    const plaintext = "UNIQUE_PLAINTEXT_MARKER_42";
    await materializeTerminalAnalytics({
      organizationId,
      logicalQueryId: "lq-enc",
      attemptId: "att-enc",
      hostname: "docs.test",
      productId: "ctix",
      outcome: "system_error",
      queryText: plaintext,
      clientIp: "203.0.113.1",
    });
    const row = await db.queryOne<{ query_ciphertext: string | null }>(
      `SELECT query_ciphertext FROM unanswered_query_reviews
       WHERE organization_id = ? AND logical_query_id = ?`,
      [organizationId, "lq-enc"]
    );
    expect(row?.query_ciphertext).toBeTruthy();
    expect(row!.query_ciphertext).not.toContain(plaintext);
  });
});

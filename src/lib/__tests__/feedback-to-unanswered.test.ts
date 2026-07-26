/**
 * Negative Ask AI feedback → unanswered triage queue.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  resetDatabaseConnection,
  setTestDatabasePath,
  db,
} from "@/lib/db/client";
import { createOrganization } from "@/lib/enterprise/repository";
import { submitChatFeedback } from "@/lib/chat-feedback/service";
import {
  enqueueUnansweredFromNegativeFeedback,
  materializeTerminalAnalytics,
} from "@/lib/query-analytics/service";
import { listUnansweredQueryReviews } from "@/lib/query-analytics/repository";

describe("negative feedback → unanswered queue", () => {
  let dbDir: string;
  let organizationId: string;
  let prevKey: string | undefined;

  beforeEach(async () => {
    prevKey = process.env.DOCUMENTATION_CREDENTIAL_ENCRYPTION_KEY;
    process.env.DOCUMENTATION_CREDENTIAL_ENCRYPTION_KEY = Buffer.alloc(
      32,
      5
    ).toString("base64");
    dbDir = mkdtempSync(path.join(tmpdir(), "fb-unans-"));
    setTestDatabasePath(path.join(dbDir, "test.sqlite"));
    resetDatabaseConnection();
    const org = await createOrganization({
      name: "FB Unans Org",
      slug: `fb-unans-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    });
    organizationId = org.id;
    const now = new Date().toISOString();
    await db.execute(
      `INSERT INTO documentation_users (id, auth0_user_id, email, name, role, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'developer', 'active', ?, ?)`,
      ["user-fb", "auth0|fb", "fb@example.com", "FB", now, now]
    );
  });

  afterEach(() => {
    resetDatabaseConnection();
    setTestDatabasePath(null);
    rmSync(dbDir, { recursive: true, force: true });
    if (prevKey === undefined) {
      delete process.env.DOCUMENTATION_CREDENTIAL_ENCRYPTION_KEY;
    } else {
      process.env.DOCUMENTATION_CREDENTIAL_ENCRYPTION_KEY = prevKey;
    }
  });

  async function seedAnswered(logicalQueryId: string) {
    await materializeTerminalAnalytics({
      organizationId,
      logicalQueryId,
      attemptId: `att-${logicalQueryId}`,
      userId: "user-fb",
      hostname: "docs.test",
      productId: "ctix",
      outcome: "answered",
      latencyMs: 12,
    });
  }

  it("thumbs-down on answered query opens unanswered review with feedback note", async () => {
    await seedAnswered("lq-down");
    const row = await submitChatFeedback({
      organizationId,
      userId: "user-fb",
      messageId: "msg-down",
      rating: "down",
      comment: "Missing steps for user@corp.example",
      logicalQueryId: "lq-down",
      productId: "ctix",
    });
    expect(row.rating).toBe("down");

    const reviews = await listUnansweredQueryReviews(organizationId, 20);
    const hit = reviews.find((r) => r.logicalQueryId === "lq-down");
    expect(hit).toBeTruthy();
    expect(hit!.status).toBe("NEW");
    expect(hit!.notes).toContain(row.id);
    expect(hit!.notes).toMatch(/unhelpful/i);
    // Email redacted in sanitized feedback note/topic
    expect(JSON.stringify(hit)).not.toContain("user@corp.example");
  });

  it("thumbs-up does not create unanswered review", async () => {
    await seedAnswered("lq-up");
    await submitChatFeedback({
      organizationId,
      userId: "user-fb",
      messageId: "msg-up",
      rating: "up",
      comment: "Perfect",
      logicalQueryId: "lq-up",
      productId: "ctix",
    });
    const reviews = await listUnansweredQueryReviews(organizationId, 20);
    expect(reviews.filter((r) => r.logicalQueryId === "lq-up")).toHaveLength(0);
  });

  it("duplicate thumbs-down is idempotent (one review)", async () => {
    await seedAnswered("lq-dup");
    await submitChatFeedback({
      organizationId,
      userId: "user-fb",
      messageId: "msg-dup",
      rating: "down",
      logicalQueryId: "lq-dup",
    });
    await submitChatFeedback({
      organizationId,
      userId: "user-fb",
      messageId: "msg-dup",
      rating: "down",
      comment: "Still wrong",
      logicalQueryId: "lq-dup",
    });
    const reviews = await listUnansweredQueryReviews(organizationId, 50);
    expect(reviews.filter((r) => r.logicalQueryId === "lq-dup")).toHaveLength(1);
  });

  it("reopens FIXED review when user later marks unhelpful", async () => {
    await seedAnswered("lq-reopen");
    // First unanswered then answered supersede → FIXED
    await materializeTerminalAnalytics({
      organizationId,
      logicalQueryId: "lq-reopen",
      attemptId: "att-fail",
      hostname: "docs.test",
      productId: "ctix",
      outcome: "no_results",
    });
    await materializeTerminalAnalytics({
      organizationId,
      logicalQueryId: "lq-reopen",
      attemptId: "att-ok",
      hostname: "docs.test",
      productId: "ctix",
      outcome: "answered",
    });
    const before = await db.queryOne<{ status: string }>(
      `SELECT status FROM unanswered_query_reviews
       WHERE organization_id = ? AND logical_query_id = ?`,
      [organizationId, "lq-reopen"]
    );
    expect(before?.status).toBe("FIXED");

    await submitChatFeedback({
      organizationId,
      userId: "user-fb",
      messageId: "msg-reopen",
      rating: "down",
      comment: "Still not useful",
      logicalQueryId: "lq-reopen",
    });
    const after = await db.queryOne<{ status: string; internal_note: string }>(
      `SELECT status, internal_note FROM unanswered_query_reviews
       WHERE organization_id = ? AND logical_query_id = ?`,
      [organizationId, "lq-reopen"]
    );
    expect(after?.status).toBe("NEW");
    expect(after?.internal_note).toMatch(/unhelpful/i);
  });

  it("enqueue helper mints analytics + triage when no event exists", async () => {
    const result = await enqueueUnansweredFromNegativeFeedback({
      organizationId,
      logicalQueryId: "lq-missing",
      feedbackId: "fb-x",
      userId: "user-fb",
      comment: "no event",
    });
    expect(result.reviewId).toBeTruthy();
    expect(result.createdOrReopened).toBe(true);
    const review = await db.queryOne<{ status: string; logical_query_id: string }>(
      `SELECT status, logical_query_id FROM unanswered_query_reviews
       WHERE organization_id = ? AND id = ?`,
      [organizationId, result.reviewId]
    );
    expect(review?.status).toBe("NEW");
    expect(review?.logical_query_id).toBe("lq-missing");
  });

  it("feedback still succeeds if unanswered enqueue throws", async () => {
    await seedAnswered("lq-soft");
    const spy = vi
      .spyOn(
        await import("@/lib/query-analytics/service"),
        "enqueueUnansweredFromNegativeFeedback"
      )
      .mockRejectedValueOnce(new Error("boom"));
    const row = await submitChatFeedback({
      organizationId,
      userId: "user-fb",
      messageId: "msg-soft",
      rating: "down",
      logicalQueryId: "lq-soft",
    });
    expect(row.rating).toBe("down");
    spy.mockRestore();
  });

  it("thumbs-down without prior analytics still opens unanswered review", async () => {
    const row = await submitChatFeedback({
      organizationId,
      userId: "user-fb",
      messageId: "msg-no-analytics",
      rating: "down",
      productId: "ctix",
    });
    expect(row.rating).toBe("down");
    const reviews = await listUnansweredQueryReviews(organizationId, 20);
    expect(reviews.some((r) => r.logicalQueryId === "msg-no-analytics")).toBe(true);
  });

  it("thumbs-down with queryText encrypts exact query for reveal", async () => {
    const plaintext = "How do I tag indicator 1.2.3.4 for user@corp.test?";
    const result = await enqueueUnansweredFromNegativeFeedback({
      organizationId,
      logicalQueryId: "lq-sensitive-fb",
      feedbackId: "fb-sensitive",
      userId: "user-fb",
      hostname: "apitest1.cyninjadev.com",
      productId: "ctix",
      queryText: plaintext,
      clientIp: "203.0.113.50",
    });
    expect(result.reviewId).toBeTruthy();

    const stored = await db.queryOne<{
      query_ciphertext: string | null;
      sanitized_topic: string | null;
    }>(
      `SELECT query_ciphertext, sanitized_topic FROM unanswered_query_reviews
       WHERE organization_id = ? AND id = ?`,
      [organizationId, result.reviewId]
    );
    expect(stored?.query_ciphertext).toBeTruthy();
    expect(stored?.query_ciphertext).not.toContain(plaintext);
    expect(stored?.sanitized_topic).not.toContain("user@corp.test");

    const { getUnansweredReviewSensitive } = await import(
      "@/lib/query-analytics/repository"
    );
    const sensitive = await getUnansweredReviewSensitive({
      organizationId,
      reviewId: result.reviewId!,
    });
    expect(sensitive?.queryStatus).toBe("ok");
    expect(sensitive?.queryText).toBe(plaintext);
    expect(sensitive?.clientIp).toBe("203.0.113.50");
  });

  it("thumbs-up marks analytics answered and closes unanswered triage", async () => {
    await materializeTerminalAnalytics({
      organizationId,
      logicalQueryId: "lq-up-fix",
      attemptId: "att-up-fix",
      userId: "user-fb",
      hostname: "docs.test",
      productId: "ctix",
      outcome: "no_verified_solution",
      latencyMs: 8,
    });
    const before = await listUnansweredQueryReviews(organizationId, 20);
    expect(before.some((r) => r.logicalQueryId === "lq-up-fix")).toBe(true);

    await submitChatFeedback({
      organizationId,
      userId: "user-fb",
      messageId: "msg-up-fix",
      rating: "up",
      logicalQueryId: "lq-up-fix",
      productId: "ctix",
    });

    const event = await db.queryOne<{ outcome: string }>(
      `SELECT outcome FROM query_analytics_events
       WHERE organization_id = ? AND logical_query_id = ?`,
      [organizationId, "lq-up-fix"]
    );
    expect(event?.outcome).toBe("answered");

    const review = await db.queryOne<{ status: string }>(
      `SELECT status FROM unanswered_query_reviews
       WHERE organization_id = ? AND logical_query_id = ?`,
      [organizationId, "lq-up-fix"]
    );
    expect(review?.status).toBe("FIXED");

    const summary = await (
      await import("@/lib/query-analytics/repository")
    ).summarizeQueryAnalytics(organizationId, "1970-01-01T00:00:00.000Z");
    expect(summary.answered).toBeGreaterThanOrEqual(1);
  });
});

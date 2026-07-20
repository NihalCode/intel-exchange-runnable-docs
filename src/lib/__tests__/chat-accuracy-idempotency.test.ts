import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  cancelTurn,
  completeTurnWithFinal,
  createConversation,
  getConversation,
  startTurn,
} from "@/lib/agent/conversation-store";
import {
  classifyQueryOutcome,
  countsTowardLogicalQueryMetrics,
  logicalQueryIdForAnalytics,
} from "@/lib/agent/query-outcome";
import { resetDatabaseConnection, setTestDatabasePath } from "@/lib/db/client";
import { createUserFromInvite } from "@/lib/db/repository";
import { createMembership, createOrganization } from "@/lib/enterprise/repository";
import { OpenAiNotConfiguredError, sanitizeProviderError } from "@/lib/openai/client";
import {
  recordQueryAnalyticsEvent,
  summarizeQueryAnalytics,
} from "@/lib/query-analytics/repository";

/**
 * Wave C -- production chat accuracy: one logical query per user turn,
 * cancel/retry must not double-count, provider failures stay client-safe.
 */

describe("logical query id (one per user turn)", () => {
  it("prefers turn id over request id so one turn maps to one logical query", () => {
    expect(logicalQueryIdForAnalytics("turn-abc", "req-1")).toBe("turn-abc");
    expect(logicalQueryIdForAnalytics("  turn-abc  ", "req-1")).toBe("turn-abc");
  });

  it("falls back to request id when no turn is persisted", () => {
    expect(logicalQueryIdForAnalytics(undefined, "req-42")).toBe("req-42");
    expect(logicalQueryIdForAnalytics(null, "req-42")).toBe("req-42");
    expect(logicalQueryIdForAnalytics("   ", "req-42")).toBe("req-42");
  });

  it("cancelled outcomes do not count toward distinct logical-query metrics", () => {
    expect(countsTowardLogicalQueryMetrics("cancelled")).toBe(false);
    expect(countsTowardLogicalQueryMetrics("answered")).toBe(true);
    expect(countsTowardLogicalQueryMetrics("provider_error")).toBe(true);
  });
});

describe("analytics: one logical query across attempts", () => {
  let tmpDir = "";
  let organizationId = "";

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "chat-acc-idem-"));
    setTestDatabasePath(path.join(tmpDir, "test.db"));
    resetDatabaseConnection();
    const organization = await createOrganization({
      name: "Idempotency Analytics Org",
      slug: `idem-analytics-${Date.now()}`,
    });
    organizationId = organization.id;
  });

  afterEach(() => {
    resetDatabaseConnection();
    setTestDatabasePath(null);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("counts distinct logical_query_id once across retry attempts", async () => {
    const logicalQueryId = logicalQueryIdForAnalytics("turn-1", "req-1");
    await recordQueryAnalyticsEvent({
      organizationId,
      logicalQueryId,
      attemptId: "attempt-a",
      hostname: "docs.test",
      outcome: "answered",
      latencyMs: 10,
    });
    await recordQueryAnalyticsEvent({
      organizationId,
      logicalQueryId,
      attemptId: "attempt-b",
      hostname: "docs.test",
      outcome: "answered",
      latencyMs: 20,
    });

    const summary = await summarizeQueryAnalytics(organizationId, "1970-01-01T00:00:00.000Z");
    expect(summary.totalLogicalQueries).toBe(1);
    expect(summary.totalAttempts).toBe(2);
    expect(summary.answered).toBe(1);
  });

  it("cancel then retry does not double-count logical queries", async () => {
    const logicalQueryId = logicalQueryIdForAnalytics("turn-retry", "req-retry");
    await recordQueryAnalyticsEvent({
      organizationId,
      logicalQueryId,
      attemptId: "cancelled-attempt",
      hostname: "docs.test",
      outcome: "cancelled",
    });
    await recordQueryAnalyticsEvent({
      organizationId,
      logicalQueryId,
      attemptId: "retry-attempt",
      hostname: "docs.test",
      outcome: "answered",
    });

    const summary = await summarizeQueryAnalytics(organizationId, "1970-01-01T00:00:00.000Z");
    expect(summary.totalLogicalQueries).toBe(1);
    expect(summary.totalAttempts).toBe(2);
    expect(summary.answered).toBe(1);
    expect(classifyQueryOutcome({ cancelled: true })).toBe("cancelled");
  });
});

describe("conversation store: cancel / idempotent turn", () => {
  let tmpDir = "";
  let organizationId = "";
  let userId = "";

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "chat-acc-conv-"));
    setTestDatabasePath(path.join(tmpDir, "test.db"));
    resetDatabaseConnection();
    const user = await createUserFromInvite({
      auth0UserId: "auth0|idem-owner",
      email: "idem-owner@test.local",
      role: "developer",
    });
    userId = user.id;
    const organization = await createOrganization({
      name: "Idempotency Conv Org",
      slug: `idem-conv-${Date.now()}`,
    });
    organizationId = organization.id;
    await createMembership({ organizationId, userId, role: "developer" });
  });

  afterEach(() => {
    resetDatabaseConnection();
    setTestDatabasePath(null);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("reuses the same turn for a repeated idempotency key (one logical query)", async () => {
    const conversation = await createConversation({
      organizationId,
      userId,
      title: "Idempotent turn",
    });
    const first = await startTurn({
      conversationId: conversation.id,
      orgId: organizationId,
      userId,
      idempotencyKey: "session:msg-1",
      userText: "List indicators",
    });
    const second = await startTurn({
      conversationId: conversation.id,
      orgId: organizationId,
      userId,
      idempotencyKey: "session:msg-1",
      userText: "List indicators",
    });

    expect(second.idempotent).toBe(true);
    expect(second.turn.id).toBe(first.turn.id);
    expect(logicalQueryIdForAnalytics(second.turn.id, "req-x")).toBe(first.turn.id);
  });

  it("cancel blocks a final and leaves no duplicate assistant_final", async () => {
    const conversation = await createConversation({
      organizationId,
      userId,
      title: "Cancel then finalize",
    });
    const started = await startTurn({
      conversationId: conversation.id,
      orgId: organizationId,
      userId,
      idempotencyKey: "cancel-retry-1",
      userText: "Long running",
    });

    const cancelled = await cancelTurn(
      started.turn.id,
      organizationId,
      userId,
      conversation.id
    );
    expect(cancelled?.status).toBe("cancelled");

    await expect(
      completeTurnWithFinal({
        turnId: started.turn.id,
        organizationId,
        userId,
        conversationId: conversation.id,
        contentText: "Should not persist after cancel",
      })
    ).rejects.toThrow(/cancelled/i);

    const detail = await getConversation(conversation.id, organizationId, userId);
    expect(detail?.messages.filter((m) => m.type === "assistant_final")).toHaveLength(0);
  });
});

describe("degraded mode: provider failure safe error shape", () => {
  it("maps provider failures to provider_error without leaking details", () => {
    expect(classifyQueryOutcome({ errorCode: "PROVIDER_ERROR" })).toBe("provider_error");
    const leaked = new Error('Embedding failed (401): {"error":{"message":"sk-secret-key"}}');
    const safe = sanitizeProviderError(leaked);
    expect(safe).toBe("The AI service is temporarily unavailable. Please try again later.");
    expect(safe).not.toMatch(/sk-|api\.openai|Embedding failed/i);
  });

  it("OpenAiNotConfiguredError exposes only the client-safe message", () => {
    const err = new OpenAiNotConfiguredError();
    expect(err.code).toBe("OPENAI_NOT_CONFIGURED");
    expect(err.clientMessage).toContain("workspace administrator");
    expect(err.clientMessage).not.toMatch(/OPENAI_API_KEY|\.env/i);
    expect(sanitizeProviderError(err)).toBe(err.clientMessage);
  });
});

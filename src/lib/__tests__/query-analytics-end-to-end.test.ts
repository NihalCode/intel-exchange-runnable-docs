/**
 * Deterministic Query Analytics end-to-end harness.
 * Uses real classify → materialize → SQL path; stubs only external nondeterminism
 * by feeding structured outcomes (no live LLM).
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  classifyQueryOutcome,
  countsTowardLogicalQueryMetrics,
  isUnansweredOutcome,
  type QueryOutcome,
  type QueryOutcomeInput,
  UNANSWERED_OUTCOMES,
} from "@/lib/agent/query-outcome";
import type { AgentResponse } from "@/lib/agent/types";
import {
  resetDatabaseConnection,
  setTestDatabasePath,
  db,
} from "@/lib/db/client";
import { createOrganization } from "@/lib/enterprise/repository";
import { isQueryAnalyticsEnabled } from "@/lib/domains/feature-gates";
import {
  materializeTerminalAnalytics,
  recordTerminalAnalyticsSafe,
} from "@/lib/query-analytics/service";
import {
  listUnansweredQueryReviews,
  summarizeQueryAnalytics,
  summarizeQueryAnalyticsFiltered,
} from "@/lib/query-analytics/repository";

type ControlledAgentScenario = {
  name: string;
  classifyInput: QueryOutcomeInput;
  expectedOutcome: QueryOutcome;
  expectedUnanswered: boolean;
};

const SCENARIOS: ControlledAgentScenario[] = [
  {
    name: "answered",
    classifyInput: {
      response: {
        mode: "workflow",
        workflow: "Use GET /objects",
        confidence: 0.9,
        fallback: false,
        citations: [{ slug: "a", title: "A", url: "/docs/ctix/a" }],
        steps: [{ title: "List", method: "GET", path: "/objects" }] as AgentResponse["steps"],
      },
      retrievalCount: 2,
    },
    expectedOutcome: "answered",
    expectedUnanswered: false,
  },
  {
    name: "partially_answered",
    classifyInput: {
      response: {
        mode: "workflow",
        workflow: "Partial",
        confidence: 0.4,
        fallback: true,
        citations: [{ slug: "a", title: "A", url: "/docs/ctix/a" }],
        steps: [{ title: "Maybe", method: "GET", path: "/x" }] as AgentResponse["steps"],
      },
      retrievalCount: 1,
    },
    expectedOutcome: "partially_answered",
    expectedUnanswered: false,
  },
  {
    name: "no_verified_solution",
    classifyInput: {
      response: {
        mode: "workflow",
        workflow: "No match",
        confidence: 0,
        fallback: true,
        citations: [],
        steps: [],
        retrievalEvidence: "no_verified_match",
      },
    },
    expectedOutcome: "no_verified_solution",
    expectedUnanswered: true,
  },
  {
    name: "no_results",
    classifyInput: {
      response: {
        mode: "workflow",
        workflow: "Empty",
        confidence: 0,
        fallback: true,
        citations: [],
        steps: [],
      },
      retrievalCount: 0,
    },
    expectedOutcome: "no_results",
    expectedUnanswered: true,
  },
  {
    name: "clarification_required",
    classifyInput: {
      response: {
        mode: "workflow",
        workflow: "Which product?",
        confidence: 0,
        fallback: true,
        citations: [],
        steps: [],
        questions: ["CTIX or CFTR?"],
      },
    },
    expectedOutcome: "clarification_required",
    expectedUnanswered: true,
  },
  {
    name: "access_blocked",
    classifyInput: { errorCode: "FEATURE_DISABLED" },
    expectedOutcome: "access_blocked",
    expectedUnanswered: false,
  },
  {
    name: "credential_blocked",
    classifyInput: { errorCode: "PRODUCT_AUTH_REQUIRED" },
    expectedOutcome: "credential_blocked",
    expectedUnanswered: false,
  },
  {
    name: "connector_unavailable",
    classifyInput: { errorCode: "CONNECTOR_UNAVAILABLE" },
    expectedOutcome: "connector_unavailable",
    expectedUnanswered: false,
  },
  {
    name: "provider_error",
    classifyInput: { errorCode: "PROVIDER_ERROR" },
    expectedOutcome: "provider_error",
    expectedUnanswered: true,
  },
  {
    name: "system_error",
    classifyInput: { errorCode: "SYSTEM_ERROR" },
    expectedOutcome: "system_error",
    expectedUnanswered: true,
  },
  {
    name: "cancelled",
    classifyInput: { cancelled: true },
    expectedOutcome: "cancelled",
    expectedUnanswered: false,
  },
];

describe("query analytics end-to-end harness", () => {
  let dbDir: string;
  let organizationId: string;

  beforeEach(async () => {
    dbDir = mkdtempSync(path.join(tmpdir(), "qa-e2e-"));
    setTestDatabasePath(path.join(dbDir, "test.sqlite"));
    resetDatabaseConnection();
    const org = await createOrganization({
      name: "QA E2E Org",
      slug: `qa-e2e-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    });
    organizationId = org.id;
  });

  afterEach(() => {
    resetDatabaseConnection();
    setTestDatabasePath(null);
    rmSync(dbDir, { recursive: true, force: true });
  });

  it("covers every outcome fixture with classify → materialize → queue membership", async () => {
    expect(SCENARIOS.map((s) => s.expectedOutcome).sort()).toEqual(
      [
        "answered",
        "partially_answered",
        "no_verified_solution",
        "no_results",
        "clarification_required",
        "access_blocked",
        "credential_blocked",
        "connector_unavailable",
        "provider_error",
        "system_error",
        "cancelled",
      ].sort()
    );

    for (const scenario of SCENARIOS) {
      const outcome = classifyQueryOutcome(scenario.classifyInput);
      expect(outcome, scenario.name).toBe(scenario.expectedOutcome);
      expect(isUnansweredOutcome(outcome), scenario.name).toBe(
        scenario.expectedUnanswered
      );
      expect(UNANSWERED_OUTCOMES.includes(outcome as never)).toBe(
        scenario.expectedUnanswered
      );

      await materializeTerminalAnalytics({
        organizationId,
        logicalQueryId: `lq-${scenario.name}`,
        attemptId: `att-${scenario.name}`,
        hostname: "docs.ctix.test",
        productId: "ctix",
        outcome,
        latencyMs: 10,
        queryText: scenario.expectedUnanswered
          ? `Need help for secret-${scenario.name}@corp.example on ${scenario.name}`
          : undefined,
      });
    }

    const summary = await summarizeQueryAnalytics(
      organizationId,
      "1970-01-01T00:00:00.000Z"
    );
    const expectedLogical = SCENARIOS.filter((s) =>
      countsTowardLogicalQueryMetrics(s.expectedOutcome)
    ).length;
    expect(summary.totalLogicalQueries).toBe(expectedLogical);
    expect(summary.totalAttempts).toBe(SCENARIOS.length);

    const expectedUnanswered = SCENARIOS.filter((s) => s.expectedUnanswered).length;
    expect(summary.unanswered).toBe(expectedUnanswered);

    const reviews = await listUnansweredQueryReviews(organizationId, 100);
    expect(reviews.length).toBe(expectedUnanswered);
    for (const review of reviews) {
      expect(isUnansweredOutcome(review.outcome as QueryOutcome)).toBe(true);
      // List surface must not leak email PII (sanitized topic may keep non-PII words)
      expect(JSON.stringify(review)).not.toMatch(/@corp\.example/);
      expect(review).not.toHaveProperty("queryText");
      expect(review).not.toHaveProperty("query_ciphertext");
    }
  });

  it("keeps one logical query across fail then answer retry without double current unanswered", async () => {
    await materializeTerminalAnalytics({
      organizationId,
      logicalQueryId: "lq-retry",
      attemptId: "att-1",
      hostname: "docs.test",
      productId: "cftr",
      outcome: "no_results",
      queryText: "retry me",
    });
    await materializeTerminalAnalytics({
      organizationId,
      logicalQueryId: "lq-retry",
      attemptId: "att-2",
      hostname: "docs.test",
      productId: "cftr",
      outcome: "answered",
    });

    const summary = await summarizeQueryAnalytics(
      organizationId,
      "1970-01-01T00:00:00.000Z"
    );
    expect(summary.totalLogicalQueries).toBe(1);
    expect(summary.totalAttempts).toBe(2);
    expect(summary.answered).toBe(1);
    // Current terminal is answered — must not also count as open unanswered
    expect(summary.unanswered).toBe(0);

    const review = await db.queryOne<{ status: string }>(
      `SELECT status FROM unanswered_query_reviews
       WHERE organization_id = ? AND logical_query_id = ?`,
      [organizationId, "lq-retry"]
    );
    expect(review?.status).toBe("FIXED");
  });

  it("isolates product metrics and rejects cross-org reads via filtered summary", async () => {
    const other = await createOrganization({
      name: "Other Org",
      slug: `qa-other-${Date.now()}`,
    });
    await materializeTerminalAnalytics({
      organizationId,
      logicalQueryId: "lq-ctix",
      attemptId: "att-ctix",
      hostname: "a.test",
      productId: "ctix",
      outcome: "answered",
    });
    await materializeTerminalAnalytics({
      organizationId: other.id,
      logicalQueryId: "lq-leak",
      attemptId: "att-leak",
      hostname: "b.test",
      productId: "ctix",
      outcome: "answered",
    });

    const filtered = await summarizeQueryAnalyticsFiltered(organizationId, {
      sinceIso: "1970-01-01T00:00:00.000Z",
      productId: "ctix",
    });
    expect(filtered.totalLogicalQueries).toBe(1);
    expect(filtered.answered).toBe(1);

    const otherSummary = await summarizeQueryAnalytics(
      other.id,
      "1970-01-01T00:00:00.000Z"
    );
    expect(otherSummary.totalLogicalQueries).toBe(1);
  });

  it("recordTerminalAnalyticsSafe never throws when materialize succeeds", async () => {
    const result = await recordTerminalAnalyticsSafe({
      organizationId,
      logicalQueryId: "lq-safe",
      attemptId: "att-safe",
      hostname: "docs.test",
      productId: "orchestrate",
      outcome: "answered",
    });
    expect(result.eventId).toBeTruthy();
    expect(result.outboxId).toBeNull();
  });

  it("feature flag defaults OFF so Ask AI recording stays gated", () => {
    const prev = process.env.QUERY_ANALYTICS_ENABLED;
    delete process.env.QUERY_ANALYTICS_ENABLED;
    expect(isQueryAnalyticsEnabled()).toBe(false);
    process.env.QUERY_ANALYTICS_ENABLED = prev;
  });
});

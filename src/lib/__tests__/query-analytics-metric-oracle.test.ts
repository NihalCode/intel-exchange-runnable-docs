/**
 * Metric oracle: admin aggregates match a deterministic fixture row set.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  resetDatabaseConnection,
  setTestDatabasePath,
} from "@/lib/db/client";
import { createOrganization } from "@/lib/enterprise/repository";
import { materializeTerminalAnalytics } from "@/lib/query-analytics/service";
import {
  summarizeQueryAnalytics,
  summarizeQueryAnalyticsFiltered,
} from "@/lib/query-analytics/repository";

describe("query analytics metric oracle", () => {
  let dbDir: string;
  let organizationId: string;

  beforeEach(async () => {
    dbDir = mkdtempSync(path.join(tmpdir(), "qa-oracle-"));
    setTestDatabasePath(path.join(dbDir, "test.sqlite"));
    resetDatabaseConnection();
    const org = await createOrganization({
      name: "Oracle Org",
      slug: `oracle-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    });
    organizationId = org.id;
  });

  afterEach(() => {
    resetDatabaseConnection();
    setTestDatabasePath(null);
    rmSync(dbDir, { recursive: true, force: true });
  });

  it("matches expected card counts for a fixed fixture set", async () => {
    const fixtures: Array<{
      logical: string;
      attempt: string;
      productId: "ctix" | "cftr" | "csap";
      outcome:
        | "answered"
        | "partially_answered"
        | "no_results"
        | "clarification_required"
        | "access_blocked"
        | "cancelled";
      latencyMs: number;
    }> = [
      {
        logical: "lq-1",
        attempt: "a1",
        productId: "ctix",
        outcome: "answered",
        latencyMs: 10,
      },
      {
        logical: "lq-2",
        attempt: "a2",
        productId: "ctix",
        outcome: "partially_answered",
        latencyMs: 20,
      },
      {
        logical: "lq-3",
        attempt: "a3",
        productId: "cftr",
        outcome: "no_results",
        latencyMs: 30,
      },
      {
        logical: "lq-4",
        attempt: "a4",
        productId: "csap",
        outcome: "clarification_required",
        latencyMs: 40,
      },
      {
        logical: "lq-5",
        attempt: "a5",
        productId: "ctix",
        outcome: "access_blocked",
        latencyMs: 50,
      },
      {
        logical: "lq-6",
        attempt: "a6",
        productId: "ctix",
        outcome: "cancelled",
        latencyMs: 60,
      },
      // Retry: same logical as lq-3 → terminal answered (oracle must not double-count)
      {
        logical: "lq-3",
        attempt: "a3b",
        productId: "cftr",
        outcome: "answered",
        latencyMs: 35,
      },
    ];

    for (const row of fixtures) {
      await materializeTerminalAnalytics({
        organizationId,
        logicalQueryId: row.logical,
        attemptId: row.attempt,
        hostname: "docs.oracle.test",
        productId: row.productId,
        outcome: row.outcome,
        latencyMs: row.latencyMs,
      });
    }

    const summary = await summarizeQueryAnalytics(
      organizationId,
      "1970-01-01T00:00:00.000Z"
    );

    // Distinct logical ids excluding cancelled-only: lq-1..5 (lq-6 cancelled)
    expect(summary.totalLogicalQueries).toBe(5);
    expect(summary.totalAttempts).toBe(7);
    expect(summary.answered).toBe(2); // lq-1 + lq-3 terminal
    expect(summary.partiallyAnswered).toBe(1);
    expect(summary.unanswered).toBe(1); // lq-4 clarification only (lq-3 fixed)
    expect(summary.clarificationRequired).toBe(1);
    expect(summary.accessBlocked).toBe(1);
    expect(summary.answerQualityDenominator).toBe(4); // answered×2 + partial + clarification

    const ctix = await summarizeQueryAnalyticsFiltered(organizationId, {
      sinceIso: "1970-01-01T00:00:00.000Z",
      productId: "ctix",
    });
    expect(ctix.totalLogicalQueries).toBe(3); // answered, partial, access_blocked (cancel excluded)
    expect(ctix.answered).toBe(1);
    expect(ctix.p50LatencyMs).not.toBeNull();
    expect(ctix.p95LatencyMs).not.toBeNull();
  });
});

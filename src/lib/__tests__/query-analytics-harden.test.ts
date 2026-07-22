import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  classifyQueryOutcome,
  isUnansweredOutcome,
  isAnswerQualityOutcome,
} from "@/lib/agent/query-outcome";
import {
  resetDatabaseConnection,
  setTestDatabasePath,
  db,
} from "@/lib/db/client";
import { createOrganization } from "@/lib/enterprise/repository";
import { authorizeEnterprise } from "@/lib/enterprise/policy";
import type { EnterprisePrincipal } from "@/lib/enterprise/types";
import { decryptSecret } from "@/lib/documentation-credentials/encryption";
import {
  escapeCsvCell,
  exportQueryAnalyticsCsv,
  summarizeQueryAnalytics,
  summarizeQueryAnalyticsFiltered,
} from "@/lib/query-analytics/repository";
import {
  enqueueAnalyticsOutbox,
  queryFingerprint,
  sanitizeTopic,
} from "@/lib/query-analytics/outbox";
import {
  materializeTerminalAnalytics,
  processAnalyticsOutbox,
  recordTerminalAnalyticsSafe,
} from "@/lib/query-analytics/service";
import { reconcileQueryAnalytics } from "@/lib/query-analytics/reconcile";
import type { ProductKey } from "@/lib/products/registry";

const PRODUCTS: ProductKey[] = ["ctix", "cftr", "csap", "orchestrate"];

describe("query analytics harden", () => {
  let dbDir: string;
  let organizationId: string;

  beforeEach(async () => {
    dbDir = mkdtempSync(path.join(tmpdir(), "qa-harden-"));
    setTestDatabasePath(path.join(dbDir, "test.sqlite"));
    resetDatabaseConnection();
    const org = await createOrganization({
      name: "QA Harden Org",
      slug: `qa-harden-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    });
    organizationId = org.id;
  });

  afterEach(() => {
    resetDatabaseConnection();
    setTestDatabasePath(null);
    rmSync(dbDir, { recursive: true, force: true });
  });

  describe("classifier / unanswered membership", () => {
    it("excludes partially_answered from unanswered queue", () => {
      expect(isUnansweredOutcome("partially_answered")).toBe(false);
      expect(isUnansweredOutcome("no_verified_solution")).toBe(true);
      expect(isUnansweredOutcome("no_results")).toBe(true);
      expect(isUnansweredOutcome("clarification_required")).toBe(true);
      expect(isUnansweredOutcome("provider_error")).toBe(true);
      expect(isUnansweredOutcome("system_error")).toBe(true);
      expect(isUnansweredOutcome("answered")).toBe(false);
      expect(isUnansweredOutcome("cancelled")).toBe(false);
    });

    it("answer-quality denominator membership matches architecture", () => {
      expect(isAnswerQualityOutcome("answered")).toBe(true);
      expect(isAnswerQualityOutcome("partially_answered")).toBe(true);
      expect(isAnswerQualityOutcome("no_verified_solution")).toBe(true);
      expect(isAnswerQualityOutcome("no_results")).toBe(true);
      expect(isAnswerQualityOutcome("clarification_required")).toBe(true);
      expect(isAnswerQualityOutcome("access_blocked")).toBe(false);
      expect(isAnswerQualityOutcome("cancelled")).toBe(false);
    });

    it("classifies from structured fields only", () => {
      expect(classifyQueryOutcome({ cancelled: true })).toBe("cancelled");
      expect(classifyQueryOutcome({ errorCode: "PROVIDER_ERROR" })).toBe(
        "provider_error"
      );
      expect(
        classifyQueryOutcome({
          response: {
            mode: "workflow",
            workflow: "No verified documentation match found for that request.",
            confidence: 0,
            fallback: true,
            citations: [],
            steps: [],
            retrievalEvidence: "no_verified_match",
          },
        })
      ).toBe("no_verified_solution");
    });
  });

  describe("logical counting and idempotency", () => {
    it("records when userId is not a persisted documentation_users row", async () => {
      await materializeTerminalAnalytics({
        organizationId,
        logicalQueryId: "lq-orphan-user",
        attemptId: "att-orphan-user",
        userId: "local-dev-user",
        hostname: "localhost",
        productId: "ctix",
        outcome: "answered",
        latencyMs: 9,
      });
      const summary = await summarizeQueryAnalytics(
        organizationId,
        "1970-01-01T00:00:00.000Z"
      );
      expect(summary.totalLogicalQueries).toBe(1);
      expect(summary.totalAttempts).toBe(1);
      expect(summary.answered).toBe(1);
      const row = await db.queryOne<{ user_id: string | null }>(
        `SELECT user_id FROM query_logical_queries
         WHERE organization_id = ? AND logical_query_id = ?`,
        [organizationId, "lq-orphan-user"]
      );
      expect(row?.user_id).toBeNull();
    });

    it("upserts projection by attempt_id without inflating attempts", async () => {
      await materializeTerminalAnalytics({
        organizationId,
        logicalQueryId: "lq-1",
        attemptId: "att-1",
        hostname: "docs.ctix.test",
        productId: "ctix",
        outcome: "answered",
        latencyMs: 12,
      });
      await materializeTerminalAnalytics({
        organizationId,
        logicalQueryId: "lq-1",
        attemptId: "att-1",
        hostname: "docs.ctix.test",
        productId: "ctix",
        outcome: "answered",
        latencyMs: 15,
      });

      const summary = await summarizeQueryAnalytics(
        organizationId,
        "1970-01-01T00:00:00.000Z"
      );
      expect(summary.totalLogicalQueries).toBe(1);
      expect(summary.totalAttempts).toBe(1);
      expect(summary.answered).toBe(1);

      const attempts = await db.query(
        `SELECT * FROM query_attempts WHERE organization_id = ?`,
        [organizationId]
      );
      expect(attempts).toHaveLength(1);
    });

    it("counts distinct logical queries across products", async () => {
      for (const productId of PRODUCTS) {
        await materializeTerminalAnalytics({
          organizationId,
          logicalQueryId: `lq-${productId}`,
          attemptId: `att-${productId}`,
          hostname: `docs.${productId}.test`,
          productId,
          outcome: "answered",
        });
      }
      const summary = await summarizeQueryAnalytics(
        organizationId,
        "1970-01-01T00:00:00.000Z"
      );
      expect(summary.totalLogicalQueries).toBe(4);
      expect(summary.answered).toBe(4);

      for (const productId of PRODUCTS) {
        const filtered = await summarizeQueryAnalyticsFiltered(organizationId, {
          sinceIso: "1970-01-01T00:00:00.000Z",
          productId,
        });
        expect(filtered.totalLogicalQueries).toBe(1);
        expect(filtered.answered).toBe(1);
      }
    });

    it("keeps partially_answered out of unanswered card", async () => {
      await materializeTerminalAnalytics({
        organizationId,
        logicalQueryId: "lq-partial",
        attemptId: "att-partial",
        hostname: "docs.test",
        productId: "ctix",
        outcome: "partially_answered",
      });
      await materializeTerminalAnalytics({
        organizationId,
        logicalQueryId: "lq-none",
        attemptId: "att-none",
        hostname: "docs.test",
        productId: "ctix",
        outcome: "no_results",
      });

      const summary = await summarizeQueryAnalytics(
        organizationId,
        "1970-01-01T00:00:00.000Z"
      );
      expect(summary.partiallyAnswered).toBe(1);
      expect(summary.answered).toBe(0);
      expect(summary.unanswered).toBe(1);
      expect(summary.answerQualityDenominator).toBe(2);
    });
  });

  describe("unanswered encryption + supersede", () => {
    it("encrypts query text and IP; successful retry supersedes without delete", async () => {
      const queryText = "How do I list indicators for user@corp.test?";
      const clientIp = "203.0.113.9";
      await materializeTerminalAnalytics({
        organizationId,
        logicalQueryId: "lq-unans",
        attemptId: "att-fail",
        hostname: "docs.test",
        productId: "cftr",
        outcome: "no_verified_solution",
        queryText,
        clientIp,
      });

      const review = await db.queryOne<Record<string, unknown>>(
        `SELECT * FROM unanswered_query_reviews WHERE organization_id = ?`,
        [organizationId]
      );
      expect(review).toBeTruthy();
      expect(review!.query_ciphertext).toBeTruthy();
      expect(String(review!.query_ciphertext)).not.toContain("indicators");
      expect(review!.query_fingerprint).toBe(queryFingerprint(queryText));
      expect(String(review!.sanitized_topic)).toContain("[email]");

      const aad = `unanswered:${organizationId}:lq-unans`;
      const decrypted = decryptSecret(
        {
          ciphertext: String(review!.query_ciphertext),
          iv: String(review!.query_iv),
          tag: String(review!.query_tag),
        },
        aad
      );
      expect(decrypted).toBe(queryText);

      await materializeTerminalAnalytics({
        organizationId,
        logicalQueryId: "lq-unans",
        attemptId: "att-ok",
        hostname: "docs.test",
        productId: "cftr",
        outcome: "answered",
      });

      const after = await db.queryOne<Record<string, unknown>>(
        `SELECT status, resolved_by_logical_query_id FROM unanswered_query_reviews
         WHERE organization_id = ? AND id = ?`,
        [organizationId, review!.id]
      );
      expect(after!.status).toBe("FIXED");
      expect(after!.resolved_by_logical_query_id).toBe("lq-unans");

      const stillThere = await db.query(
        `SELECT id FROM unanswered_query_reviews WHERE organization_id = ?`,
        [organizationId]
      );
      expect(stillThere).toHaveLength(1);
    });
  });

  describe("outbox retry", () => {
    it("enqueues on failure and processes on worker", async () => {
      const payload = {
        organizationId,
        logicalQueryId: "lq-outbox",
        attemptId: "att-outbox",
        hostname: "docs.test",
        productId: "csap" as const,
        outcome: "answered" as const,
      };
      const id = await enqueueAnalyticsOutbox({
        organizationId,
        eventType: "materialize_attempt",
        payload,
      });
      expect(id).toBeTruthy();

      const result = await processAnalyticsOutbox(10);
      expect(result.completed).toBeGreaterThanOrEqual(1);

      const summary = await summarizeQueryAnalytics(
        organizationId,
        "1970-01-01T00:00:00.000Z"
      );
      expect(summary.answered).toBe(1);
    });

    it("recordTerminalAnalyticsSafe returns without throwing on sync success", async () => {
      const safe = await recordTerminalAnalyticsSafe({
        organizationId,
        logicalQueryId: "lq-safe-2",
        attemptId: "att-safe-2",
        hostname: "docs.test",
        outcome: "answered",
      });
      expect(safe.eventId).toBeTruthy();
      expect(safe.outboxId).toBeNull();
    });
  });

  describe("CSV safety + RBAC matrix", () => {
    it("escapes formula injection and includes generated-at", async () => {
      expect(escapeCsvCell("=CMD()")).toBe(`"'=CMD()"`);
      expect(escapeCsvCell("+1")).toBe(`"'+1"`);

      await materializeTerminalAnalytics({
        organizationId,
        logicalQueryId: "lq-csv",
        attemptId: "att-csv",
        hostname: "docs.test",
        productId: "orchestrate",
        outcome: "answered",
      });
      const csv = await exportQueryAnalyticsCsv(organizationId, {
        sinceIso: "1970-01-01T00:00:00.000Z",
      });
      expect(csv).toContain("# generated_at=");
      expect(csv).toContain("# timezone=UTC");
      expect(csv).toContain("orchestrate");
    });

    it("grants read_sensitive to owner/admin only", () => {
      const owner: EnterprisePrincipal = {
        userId: "u1",
        organizationId,
        role: "owner",
        status: "active",
      };
      const developer: EnterprisePrincipal = {
        userId: "u2",
        organizationId,
        role: "developer",
        status: "active",
      };
      expect(
        authorizeEnterprise(owner, "query_analytics.read_sensitive", {
          organizationId,
        })
      ).toBe(true);
      expect(
        authorizeEnterprise(developer, "query_analytics.read_sensitive", {
          organizationId,
        })
      ).toBe(false);
      expect(
        authorizeEnterprise(developer, "query_analytics.read", {
          organizationId,
        })
      ).toBe(true);
    });
  });

  describe("reconcile exact match", () => {
    it("reports exactMatch after materialize", async () => {
      await materializeTerminalAnalytics({
        organizationId,
        logicalQueryId: "lq-rec",
        attemptId: "att-rec",
        hostname: "docs.test",
        outcome: "answered",
      });
      const reports = await reconcileQueryAnalytics(organizationId);
      expect(reports[0]?.exactMatch).toBe(true);
    });
  });

  describe("Pinecone boundary (static + call graph)", () => {
    it("unanswered service/repository modules never import pinecone", () => {
      const roots = [
        path.join(process.cwd(), "src/lib/query-analytics/service.ts"),
        path.join(process.cwd(), "src/lib/query-analytics/repository.ts"),
        path.join(process.cwd(), "src/lib/query-analytics/outbox.ts"),
        path.join(process.cwd(), "src/lib/query-analytics/reconcile.ts"),
      ];
      for (const file of roots) {
        const src = readFileSync(file, "utf8");
        expect(src).not.toMatch(/from ["']@\/lib\/agent\/pinecone["']/);
        expect(src).not.toMatch(/embedQuery|upsertRecords|pinecone\.upsert/i);
      }
    });

    it("materialize unanswered path does not call pinecone helpers", async () => {
      let pineconeMod: Record<string, unknown> | null = null;
      try {
        pineconeMod = (await import("@/lib/agent/pinecone")) as Record<
          string,
          unknown
        >;
      } catch {
        pineconeMod = null;
      }
      const spies: Array<ReturnType<typeof vi.spyOn>> = [];
      if (pineconeMod) {
        for (const key of Object.keys(pineconeMod)) {
          if (typeof pineconeMod[key] === "function") {
            spies.push(vi.spyOn(pineconeMod, key as never));
          }
        }
      }

      await materializeTerminalAnalytics({
        organizationId,
        logicalQueryId: "lq-pine",
        attemptId: "att-pine",
        hostname: "docs.test",
        productId: "ctix",
        outcome: "no_results",
        queryText: "secret unanswered topic never embed",
      });

      for (const spy of spies) {
        expect(spy).not.toHaveBeenCalled();
        spy.mockRestore();
      }
    });
  });

  describe("sanitizeTopic", () => {
    it("redacts emails and ips", () => {
      expect(sanitizeTopic("help user@x.com from 10.0.0.1")).toContain("[email]");
      expect(sanitizeTopic("help user@x.com from 10.0.0.1")).toContain("[ip]");
    });
  });
});

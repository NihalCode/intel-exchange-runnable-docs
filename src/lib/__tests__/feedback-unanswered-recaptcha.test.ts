import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  resetDatabaseConnection,
  setTestDatabasePath,
  db,
} from "@/lib/db/client";
import { createOrganization } from "@/lib/enterprise/repository";
import { authorizeEnterprise } from "@/lib/enterprise/policy";
import type { EnterprisePrincipal } from "@/lib/enterprise/types";
import { decryptSecret, encryptSecret } from "@/lib/documentation-credentials/encryption";
import { submitChatFeedback } from "@/lib/chat-feedback/service";
import { decryptFeedbackComment } from "@/lib/chat-feedback/repository";
import { resolveTrustedClientIp } from "@/lib/security/client-ip";
import { deriveCustomerNameSnapshot } from "@/lib/security/customer-name";
import {
  getRecaptchaHealthStatus,
  verifyRecaptchaToken,
} from "@/lib/recaptcha/verify";
import { defaultDocumentationFeatureEnabled } from "@/lib/documentation-features/keys";
import { materializeTerminalAnalytics, linkFeedback } from "@/lib/query-analytics/service";
import {
  buildUnansweredWeeklySnapshots,
  summarizeUnansweredReviews,
} from "@/lib/query-analytics/unanswered-intel";
import { hasPermission } from "@/lib/documentation-auth/permissions";

describe("feedback / unanswered / recaptcha / viewer", () => {
  let dbDir: string;
  let organizationId: string;

  beforeEach(async () => {
    dbDir = mkdtempSync(path.join(tmpdir(), "fu-wave-"));
    setTestDatabasePath(path.join(dbDir, "test.sqlite"));
    resetDatabaseConnection();
    const org = await createOrganization({
      name: "FU Org",
      slug: `fu-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    });
    organizationId = org.id;
  });

  afterEach(() => {
    resetDatabaseConnection();
    setTestDatabasePath(null);
    rmSync(dbDir, { recursive: true, force: true });
  });

  describe("feature flags default OFF", () => {
    it("keeps new flags out of DEFAULT_ENABLED", () => {
      expect(defaultDocumentationFeatureEnabled("chat_feedback")).toBe(false);
      expect(defaultDocumentationFeatureEnabled("viewer_ask_ai_access_enabled")).toBe(false);
      expect(defaultDocumentationFeatureEnabled("recaptcha_protection")).toBe(false);
      expect(defaultDocumentationFeatureEnabled("unanswered_query_realtime_summary")).toBe(false);
      expect(defaultDocumentationFeatureEnabled("unanswered_query_weekly_analytics")).toBe(false);
      expect(defaultDocumentationFeatureEnabled("unanswered_query_sensitive_capture")).toBe(false);
    });
  });

  describe("viewer permissions", () => {
    it("viewer has ask_agent but never test_snippets", () => {
      expect(hasPermission("viewer", "ask_agent")).toBe(true);
      expect(hasPermission("viewer", "test_snippets")).toBe(false);
      expect(hasPermission("developer", "test_snippets")).toBe(true);
    });
  });

  describe("trusted client IP", () => {
    it("prefers x-vercel-forwarded-for", () => {
      const headers = new Headers({
        "x-vercel-forwarded-for": "203.0.113.10",
        "x-forwarded-for": "198.51.100.1, 203.0.113.10",
        "x-real-ip": "192.0.2.1",
      });
      expect(resolveTrustedClientIp(headers)).toBe("203.0.113.10");
    });

    it("uses last hop of x-forwarded-for when vercel header missing", () => {
      const headers = new Headers({
        "x-forwarded-for": "198.51.100.1, 203.0.113.55",
      });
      expect(resolveTrustedClientIp(headers)).toBe("203.0.113.55");
    });

    it("rejects implausible spoof values", () => {
      const headers = new Headers({
        "x-vercel-forwarded-for": "not-an-ip",
        "x-real-ip": "2001:db8::1",
      });
      expect(resolveTrustedClientIp(headers)).toBe("2001:db8::1");
    });

    it("returns null when missing", () => {
      expect(resolveTrustedClientIp(new Headers())).toBeNull();
    });
  });

  describe("customer name derivation", () => {
    it("prefers displayName then name then email local-part", () => {
      expect(
        deriveCustomerNameSnapshot({
          displayName: "Acme SOC",
          name: "Ignored",
          email: "user@example.com",
        })
      ).toBe("Acme SOC");
      expect(
        deriveCustomerNameSnapshot({ name: "Pat Lee", email: "pat@example.com" })
      ).toBe("Pat Lee");
      expect(deriveCustomerNameSnapshot({ email: "pat@example.com" })).toBe("pat");
      expect(deriveCustomerNameSnapshot({})).toBeNull();
    });
  });

  describe("chat feedback", () => {
    it("upserts feedback, encrypts comments, and links analytics metadata", async () => {
      await db.execute(
        `INSERT INTO documentation_users (id, auth0_user_id, email, name, role, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'developer', 'active', ?, ?)`,
        ["user-1", "auth0|1", "dev@example.com", "Dev", new Date().toISOString(), new Date().toISOString()]
      );

      await materializeTerminalAnalytics({
        organizationId,
        logicalQueryId: "lq-1",
        attemptId: "att-1",
        userId: "user-1",
        hostname: "docs.example.com",
        productId: "ctix",
        outcome: "answered",
        latencyMs: 10,
      });

      const row = await submitChatFeedback({
        organizationId,
        userId: "user-1",
        messageId: "msg-1",
        rating: "up",
        comment: "Great answer",
        logicalQueryId: "lq-1",
        productId: "ctix",
      });

      expect(row.rating).toBe("up");
      const comment = await decryptFeedbackComment({
        organizationId,
        feedbackId: row.id,
      });
      expect(comment).toBe("Great answer");

      const attempt = await db.queryOne<{ metadata_json: string }>(
        `SELECT metadata_json FROM query_attempts
         WHERE organization_id = ? AND logical_query_id = ?`,
        [organizationId, "lq-1"]
      );
      const metadata = JSON.parse(String(attempt?.metadata_json ?? "{}")) as {
        feedback?: { feedbackId?: string; rating?: string };
      };
      expect(metadata.feedback?.feedbackId).toBe(row.id);
      expect(metadata.feedback?.rating).toBe("up");
    });
  });

  describe("unanswered intel", () => {
    it("summary excludes raw query/IP/name fields", async () => {
      await materializeTerminalAnalytics({
        organizationId,
        logicalQueryId: "lq-u1",
        attemptId: "att-u1",
        hostname: "docs.example.com",
        productId: "ctix",
        outcome: "no_results",
        queryText: "secret unanswered query",
        clientIp: "203.0.113.9",
        customerNameSnapshot: "Secret Corp",
      });

      const summary = await summarizeUnansweredReviews(organizationId);
      const payload = JSON.stringify(summary);
      expect(payload).not.toContain("secret unanswered");
      expect(payload).not.toContain("203.0.113.9");
      expect(payload).not.toContain("Secret Corp");
      expect(summary.totalNew).toBeGreaterThanOrEqual(1);
      expect(summary.fingerprint).toMatch(/^[a-f0-9]+$/);
    });

    it("weekly snapshots are idempotent and PII-free", async () => {
      await materializeTerminalAnalytics({
        organizationId,
        logicalQueryId: "lq-w1",
        attemptId: "att-w1",
        hostname: "docs.example.com",
        productId: "cftr",
        outcome: "no_verified_solution",
        queryText: "should not appear in weekly",
        clientIp: "198.51.100.2",
      });

      const preview = await buildUnansweredWeeklySnapshots({
        organizationId,
        dryRun: true,
      });
      expect(preview.dryRun).toBe(true);
      expect(preview.rowsUpserted).toBeGreaterThanOrEqual(1);
      const before = await db.query<{ id: string }>(
        `SELECT id FROM unanswered_weekly_snapshots WHERE organization_id = ?`,
        [organizationId]
      );
      expect(before).toHaveLength(0);

      const first = await buildUnansweredWeeklySnapshots({ organizationId });
      const second = await buildUnansweredWeeklySnapshots({ organizationId });
      expect(first.dryRun).toBe(false);
      expect(first.rowsUpserted).toBeGreaterThanOrEqual(1);
      expect(second.rowsUpserted).toBe(first.rowsUpserted);

      const rows = await db.query<{ metadata_json: string }>(
        `SELECT metadata_json FROM unanswered_weekly_snapshots WHERE organization_id = ?`,
        [organizationId]
      );
      for (const row of rows) {
        expect(row.metadata_json).not.toContain("should not appear");
        expect(row.metadata_json).not.toContain("198.51.100.2");
      }
    });
  });

  describe("Pinecone boundary", () => {
    it("unanswered and feedback modules do not import pinecone/embed", () => {
      const roots = [
        path.join(process.cwd(), "src/lib/query-analytics"),
        path.join(process.cwd(), "src/lib/chat-feedback"),
      ];
      const forbidden = [
        /from ["'][^"']*pinecone/i,
        /embedQuery/,
        /pinecone:upsert/i,
        /@pinecone-database/i,
      ];
      for (const root of roots) {
        for (const file of listTsFiles(root)) {
          const text = readFileSync(file, "utf8");
          for (const pattern of forbidden) {
            expect(text, `${file} matched ${pattern}`).not.toMatch(pattern);
          }
        }
      }
    });
  });

  describe("reCAPTCHA contracts", () => {
    it("reports health without secrets", () => {
      const prevSite = process.env.RECAPTCHA_SITE_KEY;
      const prevSecret = process.env.RECAPTCHA_SECRET_KEY;
      process.env.RECAPTCHA_SITE_KEY = "site-abc";
      process.env.RECAPTCHA_SECRET_KEY = "secret-xyz";
      const health = getRecaptchaHealthStatus();
      expect(health.configured).toBe(true);
      expect(health.siteKeyPresent).toBe(true);
      expect(health.secretPresent).toBe(true);
      expect(JSON.stringify(health)).not.toContain("secret-xyz");
      process.env.RECAPTCHA_SITE_KEY = prevSite;
      process.env.RECAPTCHA_SECRET_KEY = prevSecret;
    });

    it("fail-soft returns degraded ok when secret missing", async () => {
      const prev = process.env.RECAPTCHA_SECRET_KEY;
      delete process.env.RECAPTCHA_SECRET_KEY;
      const soft = await verifyRecaptchaToken({
        token: null,
        expectedAction: "ask_ai_submit",
        failSoft: true,
      });
      expect(soft.ok).toBe(true);
      expect(soft.degraded).toBe(true);

      const closed = await verifyRecaptchaToken({
        token: null,
        expectedAction: "public_invite",
        failSoft: false,
      });
      expect(closed.ok).toBe(false);
      process.env.RECAPTCHA_SECRET_KEY = prev;
    });

    it("public invite validate route fail-closes when protection env is on", () => {
      const route = readFileSync(
        path.join(process.cwd(), "src/app/api/invites/validate/route.ts"),
        "utf8"
      );
      expect(route).toContain('expectedAction: "public_invite"');
      expect(route).toContain("failSoft: false");
      expect(route).toContain("RECAPTCHA_PROTECTION_ENABLED");
      expect(route).toContain("resolveTrustedClientIp");
    });
  });

  describe("permissions", () => {
    it("maps unanswered read/export/sensitive for owner and denies developer sensitive", () => {
      const owner: EnterprisePrincipal = {
        userId: "o1",
        organizationId,
        role: "owner",
        status: "active",
      };
      const developer: EnterprisePrincipal = {
        userId: "d1",
        organizationId,
        role: "developer",
        status: "active",
      };
      expect(
        authorizeEnterprise(owner, "unanswered_queries.read", { organizationId })
      ).toBe(true);
      expect(
        authorizeEnterprise(owner, "unanswered_queries.export", { organizationId })
      ).toBe(true);
      expect(
        authorizeEnterprise(developer, "unanswered_queries.read", { organizationId })
      ).toBe(true);
      expect(
        authorizeEnterprise(developer, "unanswered_queries.read_sensitive", {
          organizationId,
        })
      ).toBe(false);
    });
  });

  describe("encryption round-trip", () => {
    it("encrypts feedback AAD distinctly from unanswered", () => {
      const a = encryptSecret("note", `feedback:${organizationId}:fb1`);
      const plain = decryptSecret(a, `feedback:${organizationId}:fb1`);
      expect(plain).toBe("note");
      expect(() =>
        decryptSecret(a, `unanswered:${organizationId}:lq1`)
      ).toThrow();
    });
  });

  describe("linkFeedback stub wiring", () => {
    it("is callable after materialize", async () => {
      await materializeTerminalAnalytics({
        organizationId,
        logicalQueryId: "lq-link",
        attemptId: "att-link",
        hostname: "docs.example.com",
        productId: "csap",
        outcome: "answered",
      });
      await linkFeedback({
        organizationId,
        logicalQueryId: "lq-link",
        feedbackId: "fb-x",
        rating: "down",
        note: "comment_present",
      });
      const attempt = await db.queryOne<{ metadata_json: string }>(
        `SELECT metadata_json FROM query_attempts WHERE attempt_id = ?`,
        ["att-link"]
      );
      expect(attempt?.metadata_json).toContain("fb-x");
    });
  });
});

function listTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...listTsFiles(full));
    else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

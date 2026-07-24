/**
 * POST /api/agent/feedback — integration against sqlite + AUTH_DISABLED.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";

import {
  resetDatabaseConnection,
  setTestDatabasePath,
  db,
} from "@/lib/db/client";
import { createOrganization } from "@/lib/enterprise/repository";
import { listUnansweredQueryReviews } from "@/lib/query-analytics/repository";
import { POST } from "@/app/api/agent/feedback/route";

describe("POST /api/agent/feedback", () => {
  let dbDir: string;
  let organizationId: string;
  const envBackup: Record<string, string | undefined> = {};

  beforeEach(async () => {
    envBackup.AUTH_DISABLED = process.env.AUTH_DISABLED;
    envBackup.DOCUMENTATION_CREDENTIAL_ENCRYPTION_KEY =
      process.env.DOCUMENTATION_CREDENTIAL_ENCRYPTION_KEY;
    vi.stubEnv("AUTH_DISABLED", "true");
    vi.stubEnv("NODE_ENV", "development");
    process.env.DOCUMENTATION_CREDENTIAL_ENCRYPTION_KEY = Buffer.alloc(
      32,
      9
    ).toString("base64");

    dbDir = mkdtempSync(path.join(tmpdir(), "fb-api-"));
    setTestDatabasePath(path.join(dbDir, "test.sqlite"));
    resetDatabaseConnection();
    const org = await createOrganization({
      name: "FB API Org",
      slug: `fb-api-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    });
    organizationId = org.id;
    const now = new Date().toISOString();
    await db.execute(
      `INSERT INTO documentation_users (id, auth0_user_id, email, name, role, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'owner', 'active', ?, ?)`,
      [
        "local-dev-owner",
        "auth0|local-dev-owner",
        "owner@dev.local",
        "Local owner",
        now,
        now,
      ]
    );
  });

  afterEach(() => {
    resetDatabaseConnection();
    setTestDatabasePath(null);
    rmSync(dbDir, { recursive: true, force: true });
    for (const [key, value] of Object.entries(envBackup)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    vi.unstubAllEnvs();
  });

  function feedbackRequest(body: Record<string, unknown>): NextRequest {
    return new NextRequest("http://localhost:3000/api/agent/feedback", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-test-role": "owner",
        host: "localhost:3000",
      },
      body: JSON.stringify(body),
    });
  }

  it("saves thumbs-up for signed-in owner session", async () => {
    const res = await POST(
      feedbackRequest({
        messageId: "msg-api-up",
        rating: "up",
        productId: "ctix",
      })
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { id?: string; rating?: string };
    expect(data.id).toBeTruthy();
    expect(data.rating).toBe("up");
  });

  it("saves thumbs-down and enqueues unanswered review", async () => {
    const res = await POST(
      feedbackRequest({
        messageId: "msg-api-down",
        rating: "down",
        productId: "ctix",
        comment: "Steps were wrong",
      })
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { id?: string; rating?: string };
    expect(data.rating).toBe("down");
    const reviews = await listUnansweredQueryReviews(organizationId, 20);
    expect(reviews.some((r) => r.logicalQueryId === "msg-api-down")).toBe(true);
  });

  it("rejects invalid rating", async () => {
    const res = await POST(
      feedbackRequest({ messageId: "msg-bad", rating: "sideways" })
    );
    expect(res.status).toBe(400);
  });

  it("rejects missing messageId", async () => {
    const res = await POST(feedbackRequest({ rating: "up" }));
    expect(res.status).toBe(400);
  });
});

describe("POST /api/agent/feedback anonymous viewer", () => {
  let dbDir: string;
  let organizationId: string;
  const envBackup: Record<string, string | undefined> = {};

  beforeEach(async () => {
    envBackup.AUTH_DISABLED = process.env.AUTH_DISABLED;
    envBackup.DOCUMENTATION_CREDENTIAL_ENCRYPTION_KEY =
      process.env.DOCUMENTATION_CREDENTIAL_ENCRYPTION_KEY;
    vi.stubEnv("AUTH_DISABLED", "false");
    vi.stubEnv("NODE_ENV", "test");
    process.env.DOCUMENTATION_CREDENTIAL_ENCRYPTION_KEY = Buffer.alloc(
      32,
      11
    ).toString("base64");

    dbDir = mkdtempSync(path.join(tmpdir(), "fb-anon-api-"));
    setTestDatabasePath(path.join(dbDir, "test.sqlite"));
    resetDatabaseConnection();
    const org = await createOrganization({
      name: "Anon API Org",
      slug: `anon-api-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    });
    organizationId = org.id;
  });

  afterEach(() => {
    resetDatabaseConnection();
    setTestDatabasePath(null);
    rmSync(dbDir, { recursive: true, force: true });
    for (const [key, value] of Object.entries(envBackup)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    vi.unstubAllEnvs();
  });

  it("saves anonymous thumbs-down (production parity path)", async () => {
    const res = await POST(
      new NextRequest("http://localhost:3000/api/agent/feedback", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          host: "localhost:3000",
        },
        body: JSON.stringify({
          messageId: "msg-anon-api-down",
          rating: "down",
          productId: "ctix",
        }),
      })
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { id?: string; error?: string };
    expect(data.error).toBeUndefined();
    expect(data.id).toBeTruthy();
    const reviews = await listUnansweredQueryReviews(organizationId, 20);
    expect(reviews.some((r) => r.logicalQueryId === "msg-anon-api-down")).toBe(
      true
    );
  });
});

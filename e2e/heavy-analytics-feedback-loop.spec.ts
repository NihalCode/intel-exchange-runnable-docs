import { test, expect, type APIRequestContext } from "@playwright/test";

/**
 * Heavy local proof that Ask AI responses are counted in Query Analytics,
 * and that thumbs feedback moves rows between answered ↔ unanswered.
 *
 * Semantics under test (product policy):
 * - Successful Ask AI → outcome `answered` by default (no feedback required)
 * - Thumbs-down → force `no_verified_solution` + unanswered NEW row
 * - Thumbs-up → force `answered` + close open unanswered reviews
 */
test.describe.configure({ mode: "serial" });

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const MARKER = `qa-heavy-analytics-${Date.now()}`;

type AnalyticsSummary = {
  answered?: number;
  unanswered?: number;
  totalLogicalQueries?: number;
};

type AnalyticsPayload = {
  summary?: AnalyticsSummary;
  recent?: Array<{ logicalQueryId?: string; outcome?: string }>;
  loadError?: string | null;
};

async function getCsrf(request: APIRequestContext) {
  const res = await request.get("/api/auth/csrf", {
    headers: { "x-test-role": "owner", Origin: BASE },
  });
  expect(res.ok(), await res.text()).toBeTruthy();
  const body = (await res.json()) as { csrfToken?: string };
  expect(body.csrfToken).toBeTruthy();
  return body.csrfToken!;
}

async function analytics(request: APIRequestContext): Promise<AnalyticsPayload> {
  const res = await request.get("/api/admin/query-analytics", {
    headers: { "x-test-role": "owner", Origin: BASE },
  });
  expect(res.status(), await res.text()).toBe(200);
  return (await res.json()) as AnalyticsPayload;
}

async function unansweredRows(request: APIRequestContext) {
  const res = await request.get("/api/admin/unanswered-queries", {
    headers: { "x-test-role": "owner", Origin: BASE },
  });
  expect(res.status(), await res.text()).toBe(200);
  const json = (await res.json()) as {
    rows?: Array<{ id: string; status: string; logicalQueryId?: string }>;
    items?: Array<{ id: string; status: string; logicalQueryId?: string }>;
  };
  return json.rows ?? json.items ?? [];
}

test.describe("heavy: Ask AI → analytics count → feedback triage", () => {
  test("Ask AI success increments answered; thumbs-down opens unanswered; thumbs-up closes", async ({
    request,
    browser,
  }) => {
    const before = await analytics(request);
    expect(before.loadError ?? null).toBeNull();
    const answeredBefore = before.summary?.answered ?? 0;
    const unansweredBefore = before.summary?.unanswered ?? 0;

    // ── A) Ask AI records as answered (no feedback) ───────────────────────
    const queryA = `${MARKER} A explain AccessID Signature Expires briefly`;
    const agentA = await request.post("/api/agent", {
      headers: {
        "x-test-role": "owner",
        "content-type": "application/json",
        Origin: BASE,
      },
      data: { query: queryA, mode: "workflow", productId: "ctix" },
    });
    expect(agentA.status(), await agentA.text()).toBe(200);
    const agentAJson = (await agentA.json()) as {
      analytics?: { logicalQueryId?: string; attemptId?: string | null };
      workflow?: unknown;
      steps?: unknown;
      plan?: unknown;
    };
    const lqA = agentAJson.analytics?.logicalQueryId;
    expect(lqA, "agent response must include analytics.logicalQueryId").toBeTruthy();
    expect(
      Boolean(agentAJson.workflow || agentAJson.steps || agentAJson.plan)
    ).toBeTruthy();

    // Poll analytics until the terminal event is visible (materialize is sync but
    // summary reads can race on fresh SQLite in rare cases).
    let afterAsk: AnalyticsPayload | null = null;
    await expect
      .poll(
        async () => {
          afterAsk = await analytics(request);
          const hit = (afterAsk.recent ?? []).some(
            (r) => r.logicalQueryId === lqA && r.outcome === "answered"
          );
          return hit || (afterAsk.summary?.answered ?? 0) > answeredBefore;
        },
        { timeout: 15_000 }
      )
      .toBeTruthy();

    expect(afterAsk!.summary?.answered ?? 0).toBeGreaterThanOrEqual(answeredBefore + 1);
    const recentA = (afterAsk!.recent ?? []).find((r) => r.logicalQueryId === lqA);
    if (recentA) {
      expect(recentA.outcome).toBe("answered");
    }

    // No unanswered row yet for this logical query.
    const rowsAfterAsk = await unansweredRows(request);
    expect(rowsAfterAsk.some((r) => r.logicalQueryId === lqA && /NEW|REVIEWED/i.test(r.status))).toBe(
      false
    );

    // ── B) Thumbs-down flips to unanswered triage ─────────────────────────
    const csrfDown = await getCsrf(request);
    const down = await request.post("/api/agent/feedback", {
      headers: {
        "x-test-role": "owner",
        "content-type": "application/json",
        Origin: BASE,
        "x-csrf-token": csrfDown,
      },
      data: {
        messageId: `${MARKER}-A-down`,
        rating: "down",
        productId: "ctix",
        queryText: queryA,
        logicalQueryId: lqA,
      },
    });
    expect(down.status(), await down.text()).toBe(200);

    await expect
      .poll(
        async () => {
          const rows = await unansweredRows(request);
          return rows.some(
            (r) => r.logicalQueryId === lqA && /NEW|REVIEWED/i.test(r.status)
          );
        },
        { timeout: 15_000 }
      )
      .toBeTruthy();

    const mid = await analytics(request);
    const unansweredMid = mid.summary?.unanswered ?? 0;
    expect(unansweredMid).toBeGreaterThanOrEqual(unansweredBefore + 1);

    // Admin UI: unanswered page shows our marker / row; analytics page healthy.
    const owner = await browser.newContext({
      extraHTTPHeaders: { "x-test-role": "owner" },
    });
    const page = await owner.newPage();
    await page.goto("/admin/documentation-agent/unanswered");
    await expect(
      page.locator("#admin-main-content").getByRole("heading", {
        level: 1,
        name: /unanswered queries/i,
      })
    ).toBeVisible();
    await expect(page.getByText(new RegExp(MARKER.slice(0, 20), "i")).first()).toBeVisible({
      timeout: 15_000,
    });

    await page.goto("/admin/documentation-agent/query-analytics");
    await expect(page.getByTestId("query-analytics-page")).toBeVisible();
    await expect(page.getByRole("button", { name: /apply filters/i })).toBeVisible();
    await expect(page.getByTestId("query-analytics-load-error")).toHaveCount(0);
    // Metric cards: Answered + Unanswered (review queue).
    await expect(page.getByText(/^answered$/i).first()).toBeVisible();
    await expect(page.getByText(/unanswered \(review queue\)/i).first()).toBeVisible();

    // ── C) Thumbs-up recovers to answered and closes triage ───────────────
    const csrfUp = await getCsrf(request);
    const up = await request.post("/api/agent/feedback", {
      headers: {
        "x-test-role": "owner",
        "content-type": "application/json",
        Origin: BASE,
        "x-csrf-token": csrfUp,
      },
      data: {
        messageId: `${MARKER}-A-up`,
        rating: "up",
        productId: "ctix",
        queryText: queryA,
        logicalQueryId: lqA,
      },
    });
    expect(up.status(), await up.text()).toBe(200);

    await expect
      .poll(
        async () => {
          const rows = await unansweredRows(request);
          const open = rows.find(
            (r) => r.logicalQueryId === lqA && /NEW|REVIEWED/i.test(r.status)
          );
          return !open;
        },
        { timeout: 15_000 }
      )
      .toBeTruthy();

    // ── D) Second Ask AI + thumbs-up only (never unanswered) ──────────────
    const queryB = `${MARKER} B list Open API auth query params`;
    const agentB = await request.post("/api/agent", {
      headers: {
        "x-test-role": "owner",
        "content-type": "application/json",
        Origin: BASE,
      },
      data: { query: queryB, mode: "workflow", productId: "ctix" },
    });
    expect(agentB.status(), await agentB.text()).toBe(200);
    const agentBJson = (await agentB.json()) as {
      analytics?: { logicalQueryId?: string };
    };
    const lqB = agentBJson.analytics?.logicalQueryId;
    expect(lqB).toBeTruthy();

    const csrfUpB = await getCsrf(request);
    const upB = await request.post("/api/agent/feedback", {
      headers: {
        "x-test-role": "owner",
        "content-type": "application/json",
        Origin: BASE,
        "x-csrf-token": csrfUpB,
      },
      data: {
        messageId: `${MARKER}-B-up`,
        rating: "up",
        productId: "ctix",
        queryText: queryB,
        logicalQueryId: lqB,
      },
    });
    expect(upB.status(), await upB.text()).toBe(200);

    const rowsB = await unansweredRows(request);
    expect(rowsB.some((r) => r.logicalQueryId === lqB && /NEW|REVIEWED/i.test(r.status))).toBe(
      false
    );

    // Stress Apply Filters / Export affordances (no destructive writes).
    await page.getByRole("button", { name: /apply filters/i }).click();
    await expect(page.getByTestId("query-analytics-load-error")).toHaveCount(0);
    await expect(page.getByRole("link", { name: /export csv/i })).toBeVisible();

    await owner.close();
  });

  test("rapid Ask AI bursts still land unique logical analytics events", async ({
    request,
  }) => {
    const before = await analytics(request);
    const answeredBefore = before.summary?.answered ?? 0;
    const n = 5;
    const ids: string[] = [];

    await Promise.all(
      Array.from({ length: n }, async (_, i) => {
        const res = await request.post("/api/agent", {
          headers: {
            "x-test-role": "owner",
            "content-type": "application/json",
            Origin: BASE,
          },
          data: {
            query: `${MARKER} burst-${i} ping endpoint purpose`,
            mode: "workflow",
            productId: "ctix",
          },
        });
        expect(res.status()).toBe(200);
        const json = (await res.json()) as {
          analytics?: { logicalQueryId?: string };
        };
        expect(json.analytics?.logicalQueryId).toBeTruthy();
        ids.push(json.analytics!.logicalQueryId!);
      })
    );

    expect(new Set(ids).size).toBe(n);

    await expect
      .poll(
        async () => {
          const after = await analytics(request);
          const found = ids.filter((id) =>
            (after.recent ?? []).some((r) => r.logicalQueryId === id)
          ).length;
          // recent window may truncate; also accept answered delta.
          return (
            found >= Math.min(n, 3) ||
            (after.summary?.answered ?? 0) >= answeredBefore + n
          );
        },
        { timeout: 20_000 }
      )
      .toBeTruthy();
  });
});

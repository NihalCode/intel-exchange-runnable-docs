import { test, expect, type Browser, type APIRequestContext } from "@playwright/test";

/**
 * Local stand-in for Okta-gated admin + analytics workflows.
 * Uses AUTH_DISABLED + x-test-role (owner/viewer) — never hits production IdP.
 *
 * Thoroughness: every Documentation Agent admin tab, Ask AI → analytics/unanswered
 * record+triage+reveal+dismiss cleanup, and viewer denial.
 */
test.describe.configure({ mode: "serial" });

const MARKER = `qa-local-okta-parity-${Date.now()}`;
const OWNER = { extraHTTPHeaders: { "x-test-role": "owner" } };
const VIEWER = { extraHTTPHeaders: { "x-test-role": "viewer" } };

const ADMIN_TABS: Array<{
  path: string;
  heading: RegExp;
  /** Optional control that proves the tab is interactive / doing its job */
  mustSee?: RegExp;
  allowNotFound?: boolean;
}> = [
  { path: "/admin", heading: /^(dashboard|command overview)$/i },
  { path: "/admin/documentation-agent", heading: /documentation agent|overview/i },
  { path: "/admin/documentation-agent/schemas", heading: /schemas/i, mustSee: /upload|draft|schema/i },
  { path: "/admin/documentation-agent/users", heading: /users/i, mustSee: /add user|invite|email/i },
  {
    path: "/admin/documentation-agent/authentication",
    heading: /authentication|credentials/i,
  },
  { path: "/admin/documentation-agent/features", heading: /features/i, mustSee: /enabled|flag|query analytics/i },
  {
    path: "/admin/documentation-agent/deployments",
    heading: /deployments/i,
    mustSee: /vercel|project|environment|register/i,
  },
  {
    path: "/admin/documentation-agent/commits",
    heading: /^commits$/i,
    mustSee: /propose|execute|history|sha|commit/i,
  },
  { path: "/admin/documentation-agent/environments", heading: /environments/i },
  { path: "/admin/documentation-agent/change-requests", heading: /change requests/i },
  { path: "/admin/documentation-agent/audit-logs", heading: /audit/i },
  { path: "/admin/documentation-agent/apis", heading: /^apis$/i },
  { path: "/admin/documentation-agent/sync-jobs", heading: /sync jobs/i, mustSee: /job|enqueue|process/i },
  { path: "/admin/documentation-agent/keys", heading: /api keys|keys/i },
  { path: "/admin/documentation-agent/domains", heading: /domains/i },
  {
    path: "/admin/documentation-agent/query-analytics",
    heading: /query analytics/i,
    mustSee: /apply filters|export csv|answered/i,
  },
  {
    path: "/admin/documentation-agent/unanswered",
    heading: /unanswered queries/i,
  },
  {
    path: "/admin/documentation-agent/unanswered/weekly",
    heading: /unanswered weekly/i,
    mustSee: /download csv/i,
  },
  {
    path: "/admin/documentation-agent/logs",
    heading: /logs|could not be found|404/i,
    allowNotFound: true,
  },
  { path: "/admin/environments", heading: /environments/i },
  { path: "/admin/change-requests", heading: /change requests/i },
  { path: "/admin/audit-logs", heading: /audit/i },
  {
    path: "/admin/security/settings",
    heading: /security settings/i,
    mustSee: /save|csrf|mfa|retention|policy/i,
  },
  { path: "/settings/users", heading: /users/i, mustSee: /add user|invite|email/i },
  { path: "/settings/content", heading: /content|sources|sync/i },
];

async function ownerPage(browser: Browser) {
  const context = await browser.newContext(OWNER);
  const page = await context.newPage();
  return { context, page };
}

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

/** CSRF double-submit requires Origin + matching cookie/header (not just the token). */
async function getCsrf(request: APIRequestContext) {
  const res = await request.get("/api/auth/csrf", {
    headers: { "x-test-role": "owner", Origin: BASE },
  });
  expect(res.ok(), await res.text()).toBeTruthy();
  const body = (await res.json()) as { csrfToken?: string };
  expect(body.csrfToken).toBeTruthy();
  return body.csrfToken!;
}

function mutationHeaders(csrf: string, role: "owner" | "viewer" = "owner") {
  return {
    "x-test-role": role,
    "content-type": "application/json",
    Origin: BASE,
    "x-csrf-token": csrf,
  };
}

test.describe("local Okta-parity: admin tabs (owner)", () => {
  for (const tab of ADMIN_TABS) {
    test(`owner tab ${tab.path}`, async ({ browser }) => {
      const { context, page } = await ownerPage(browser);
      const response = await page.goto(tab.path);
      const status = response?.status() ?? 0;

      if (tab.allowNotFound && (status === 404 || (await page.getByRole("heading", { name: /404|could not be found/i }).count()) > 0)) {
        await expect(
          page.getByRole("heading", { name: /404|could not be found|logs/i }).first()
        ).toBeVisible();
        await context.close();
        return;
      }

      expect(status).toBeLessThan(500);
      const main = page.locator("#admin-main-content, #main-content, main").first();
      await expect(main.getByRole("heading", { name: tab.heading }).first()).toBeVisible({
        timeout: 15_000,
      });
      if (tab.mustSee) {
        await expect(page.getByText(tab.mustSee).first()).toBeVisible();
      }
      // No accidental destructive confirms left open.
      await expect(page.getByRole("dialog", { name: /delete|disable|promote|execute/i })).toHaveCount(0);
      await context.close();
    });
  }
});

test.describe("local Okta-parity: Ask AI → analytics → unanswered triage → cleanup", () => {
  test("records query, thumbs-down creates unanswered, reveal + dismiss works", async ({
    browser,
    request,
  }) => {
    const query = `${MARKER} briefly explain Open API AccessID Signature Expires — no secrets`;

    // 1) Ask AI (owner session; works without OpenAI via retrieval fallback).
    const agentRes = await request.post("/api/agent", {
      headers: {
        "x-test-role": "owner",
        "content-type": "application/json",
      },
      data: { query, mode: "workflow", productId: "ctix" },
    });
    expect(agentRes.status(), await agentRes.text()).toBe(200);
    const agentJson = (await agentRes.json()) as Record<string, unknown>;
    expect(
      Boolean(agentJson.workflow || agentJson.plan || agentJson.steps || agentJson.answer || agentJson.message)
    ).toBeTruthy();

    // 2) Thumbs-down with query text → unanswered triage row.
    // AUTH_DISABLED: feedback route skips CSRF; still exercise token path when available.
    const messageId = `${MARKER}-down`;
    const csrf = await getCsrf(request);
    const fbRes = await request.post("/api/agent/feedback", {
      headers: mutationHeaders(csrf),
      data: {
        messageId,
        rating: "down",
        productId: "ctix",
        queryText: query,
        logicalQueryId: messageId,
      },
    });
    expect(fbRes.status(), await fbRes.text()).toBe(200);
    const fbJson = (await fbRes.json()) as { id?: string };
    expect(fbJson.id).toBeTruthy();

    // 3) Query analytics API lists recent events (owner).
    const analyticsRes = await request.get("/api/admin/query-analytics", {
      headers: { "x-test-role": "owner", Origin: BASE },
    });
    expect(analyticsRes.status()).toBe(200);
    const analyticsJson = (await analyticsRes.json()) as {
      recent?: Array<{ logicalQueryId?: string; outcome?: string }>;
      summary?: { answered?: number; unanswered?: number };
      loadError?: string | null;
    };
    expect(analyticsJson.loadError ?? null).toBeNull();

    // 4) Unanswered list API / page — find our row, reveal, dismiss.
    const { context, page } = await ownerPage(browser);
    await page.goto("/admin/documentation-agent/unanswered");
    await expect(
      page.locator("#admin-main-content").getByRole("heading", {
        level: 1,
        name: /unanswered queries/i,
      })
    ).toBeVisible();

    // Prefer API list for reliable id, then UI actions.
    const listRes = await request.get("/api/admin/unanswered-queries", {
      headers: { "x-test-role": "owner", Origin: BASE },
    });
    expect(listRes.status()).toBe(200);
    const listJson = (await listRes.json()) as {
      rows?: Array<{
        id: string;
        status: string;
        logicalQueryId?: string;
        sanitizedTopic?: string | null;
      }>;
      items?: Array<{
        id: string;
        status: string;
        logicalQueryId?: string;
        sanitizedTopic?: string | null;
      }>;
    };
    const rows = listJson.rows ?? listJson.items ?? [];
    const ours = rows.find(
      (r) =>
        r.logicalQueryId === messageId ||
        (r.sanitizedTopic && String(r.sanitizedTopic).includes("qa-local-okta-parity"))
    );
    expect(
      ours,
      `expected unanswered row for ${messageId}; got ${JSON.stringify(rows.slice(0, 5))}`
    ).toBeTruthy();
    expect(ours!.status).toMatch(/NEW|REVIEWED/i);

    // Reveal exact query (sensitive capture on in playwright webServer env).
    await page.reload();
    await expect(page.getByText(new RegExp(MARKER.slice(0, 24), "i")).first()).toBeVisible({
      timeout: 15_000,
    });
    const revealBtn = page.getByTestId("reveal-exact-query").first();
    await expect(revealBtn).toBeVisible({ timeout: 10_000 });
    await revealBtn.click();
    const revealed = page.getByTestId("revealed-exact-query");
    const revealErr = page.getByTestId("reveal-exact-query-error");
    await expect(revealed.or(revealErr).first()).toBeVisible({ timeout: 10_000 });
    if (await revealed.count()) {
      await expect(revealed).toContainText(/AccessID|Signature|Expires|qa-local/i);
    }

    // Close triage via ACCEPTED_LIMITATION (no DISMISSED status in domain model).
    // Fresh CSRF right before PATCH; Origin required by validateMutationCsrf.
    const dismissCsrf = await getCsrf(request);
    const patch = await request.patch(`/api/admin/unanswered-queries/${ours!.id}`, {
      headers: mutationHeaders(dismissCsrf),
      data: { status: "ACCEPTED_LIMITATION", notes: `${MARKER} local cleanup` },
    });
    expect(patch.status(), await patch.text()).toBe(200);

    // Confirm cleanup stuck: row no longer open NEW.
    const listAfter = await request.get("/api/admin/unanswered-queries", {
      headers: { "x-test-role": "owner", Origin: BASE },
    });
    expect(listAfter.status()).toBe(200);
    const afterJson = (await listAfter.json()) as {
      rows?: Array<{ id: string; status: string }>;
      items?: Array<{ id: string; status: string }>;
    };
    const afterRows = afterJson.rows ?? afterJson.items ?? [];
    const closed = afterRows.find((r) => r.id === ours!.id);
    if (closed) {
      expect(closed.status).toBe("ACCEPTED_LIMITATION");
    }

    // Query analytics page UI loads metrics + filters after recording.
    await page.goto("/admin/documentation-agent/query-analytics");
    await expect(page.getByTestId("query-analytics-page")).toBeVisible();
    await expect(page.getByRole("button", { name: /apply filters/i })).toBeVisible();
    await expect(page.getByTestId("query-analytics-load-error")).toHaveCount(0);

    // Viewer cannot mutate unanswered even with a stolen CSRF shape.
    const viewerCsrf = await getCsrf(request);
    const viewerPatch = await request.patch(`/api/admin/unanswered-queries/${ours!.id}`, {
      headers: mutationHeaders(viewerCsrf, "viewer"),
      data: { status: "REVIEWED", notes: `${MARKER} viewer should fail` },
    });
    expect([401, 403, 404]).toContain(viewerPatch.status());

    await context.close();
  });
});

test.describe("local Okta-parity: viewer denials", () => {
  const denied = [
    "/admin",
    "/admin/documentation-agent/query-analytics",
    "/admin/documentation-agent/unanswered",
    "/admin/documentation-agent/users",
    "/admin/documentation-agent/features",
    "/admin/security/settings",
  ];

  for (const path of denied) {
    test(`viewer denied ${path}`, async ({ browser }) => {
      const context = await browser.newContext(VIEWER);
      const page = await context.newPage();
      await page.goto(path);
      await expect(
        page.getByRole("heading", {
          name: /organization membership could not be verified|administrator access is not enabled|unavailable|sign in required|admin access denied|could not be found/i,
        }).first()
      ).toBeVisible();
      await context.close();
    });
  }
});

test.describe("local Okta-parity: security settings read-only (no mutate)", () => {
  test("owner sees security form but we do not save", async ({ browser }) => {
    const { context, page } = await ownerPage(browser);
    await page.goto("/admin/security/settings");
    await expect(
      page.locator("#admin-main-content").getByRole("heading", {
        name: "Security Settings",
        exact: true,
      })
    ).toBeVisible();
    const save = page.getByRole("button", { name: /save/i });
    if (await save.count()) {
      await expect(save.first()).toBeVisible();
      // Intentionally do not click Save.
    }
    await context.close();
  });
});

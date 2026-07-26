import { test, expect, type APIRequestContext } from "@playwright/test";

/**
 * Thorough Commits tab coverage with VERCEL_PROVIDER_FAKE=true.
 * Hard blacklist: never click Switch now / Execute approved (even against fake).
 * Propose (Request switch) is allowed — creates a local change request only.
 */
test.describe.configure({ mode: "serial" });

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const OWNER = { extraHTTPHeaders: { "x-test-role": "owner" } };
const VIEWER = { extraHTTPHeaders: { "x-test-role": "viewer" } };

async function getCsrf(request: APIRequestContext) {
  const res = await request.get("/api/auth/csrf", {
    headers: { "x-test-role": "owner", Origin: BASE },
  });
  expect(res.ok(), await res.text()).toBeTruthy();
  const body = (await res.json()) as { csrfToken?: string };
  expect(body.csrfToken).toBeTruthy();
  return body.csrfToken!;
}

async function loadCommitsApi(
  request: APIRequestContext,
  environment?: string
) {
  const q = environment ? `?environment=${encodeURIComponent(environment)}` : "";
  const res = await request.get(`/api/admin/deployments/commits${q}`, {
    headers: { "x-test-role": "owner", Origin: BASE },
  });
  return res;
}

test.describe("heavy: commits tab (fake Vercel, no promote)", () => {
  test("API returns commit histories shape for owner", async ({ request }) => {
    const res = await loadCommitsApi(request);
    // Feature may be on with empty registered deployments — still 200 + products array.
    expect(res.status(), await res.text()).toBe(200);
    const json = (await res.json()) as {
      products?: unknown[];
      listLimitNote?: string;
      error?: string;
    };
    expect(json.error).toBeFalsy();
    expect(Array.isArray(json.products)).toBeTruthy();
    expect(json.listLimitNote ?? "").toMatch(/25|github|vercel/i);
  });

  test("owner UI: heading, Refresh, propose/execute copy, table controls", async ({
    browser,
  }) => {
    const context = await browser.newContext(OWNER);
    const page = await context.newPage();
    await page.goto("/admin/documentation-agent/commits");

    const main = page.locator("#admin-main-content");
    await expect(main.getByRole("heading", { name: /^commits$/i })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(/propose|approve|execute|github|vercel/i).first()).toBeVisible();

    const refresh = page.getByRole("button", { name: /^refresh$/i });
    await expect(refresh).toBeVisible();
    await refresh.click();
    // Rapid refresh stress (5×) — must not crash / leave error dialog.
    for (let i = 0; i < 5; i++) {
      await refresh.click();
      await page.waitForTimeout(150);
    }
    await expect(main.getByRole("heading", { name: /^commits$/i })).toBeVisible();
    await expect(page.getByRole("dialog", { name: /delete|disable|promote/i })).toHaveCount(0);

    // Env query param navigation.
    for (const env of ["production", "staging", "preview", "development"] as const) {
      await page.goto(`/admin/documentation-agent/commits?env=${env}`);
      await expect(main.getByRole("heading", { name: /^commits$/i })).toBeVisible({
        timeout: 10_000,
      });
      await refresh.click();
    }

    // Production must not expose Switch now (policy).
    await page.goto("/admin/documentation-agent/commits?env=production");
    await expect(main.getByRole("heading", { name: /^commits$/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /^switch now$/i })).toHaveCount(0);

    await page.goto("/admin/documentation-agent/commits?env=preview");
    await expect(main.getByRole("heading", { name: /^commits$/i })).toBeVisible();

    await context.close();
  });

  test("safe propose path via API when a registered deployment exists", async ({
    request,
  }) => {
    const list = await loadCommitsApi(request);
    expect(list.status()).toBe(200);
    const json = (await list.json()) as {
      products?: Array<{
        deploymentId?: string;
        environment?: string;
        commits?: Array<{
          vercelDeploymentId?: string;
          switchable?: boolean;
          likelyCurrent?: boolean;
          shortSha?: string;
          meta?: { githubCommitSha?: string };
        }>;
      }>;
    };

    const product = (json.products ?? []).find((p) =>
      (p.commits ?? []).some((c) => c.switchable && !c.likelyCurrent)
    );
    const target = product?.commits?.find((c) => c.switchable && !c.likelyCurrent);
    const deploymentId = product?.deploymentId;
    const vercelDeploymentId = target?.vercelDeploymentId;

    test.skip(
      !deploymentId || !vercelDeploymentId,
      "no registered product deployment with switchable fake commit — UI/API shape already covered"
    );

    const csrf = await getCsrf(request);
    const res = await request.post(
      `/api/admin/deployments/${deploymentId}/commits/switch`,
      {
        headers: {
          "x-test-role": "owner",
          "content-type": "application/json",
          Origin: BASE,
          "x-csrf-token": csrf,
          "idempotency-key": `e2e-propose-${Date.now()}`,
        },
        data: {
          mode: "propose",
          proposeOnly: true,
          vercelDeploymentId,
          commitSha: target?.meta?.githubCommitSha ?? target?.shortSha ?? null,
        },
      }
    );
    expect([200, 201, 409]).toContain(res.status());
    const body = await res.text();
    expect(body.toLowerCase()).not.toMatch(/promoted to production/);
  });

  test("viewer denied commits page + API", async ({ browser, request }) => {
    const api = await request.get("/api/admin/deployments/commits", {
      headers: { "x-test-role": "viewer", Origin: BASE },
    });
    expect([401, 403, 404]).toContain(api.status());

    const context = await browser.newContext(VIEWER);
    const page = await context.newPage();
    await page.goto("/admin/documentation-agent/commits");
    await expect(
      page.getByRole("heading", {
        name: /organization membership could not be verified|administrator access is not enabled|unavailable|sign in required|admin access denied|could not be found/i,
      })
    ).toBeVisible();
    await context.close();
  });

  test("UI stress: env flip + refresh storm without dialogs", async ({ browser }) => {
    const context = await browser.newContext(OWNER);
    const page = await context.newPage();

    const envs = ["production", "preview", "staging", "development"];
    for (let round = 0; round < 3; round++) {
      for (const env of envs) {
        await page.goto(`/admin/documentation-agent/commits?env=${env}`);
        await expect(
          page.locator("#admin-main-content").getByRole("heading", { name: /^commits$/i })
        ).toBeVisible({ timeout: 10_000 });
        const refresh = page.getByRole("button", { name: /^refresh$/i });
        if (await refresh.count()) {
          await refresh.click();
        }
      }
    }

    await expect(page.getByRole("dialog")).toHaveCount(0);
    const dangerous = page.getByRole("button", {
      name: /^(switch now|execute approved)$/i,
    });
    const count = await dangerous.count();
    for (let i = 0; i < count; i++) {
      await expect(dangerous.nth(i)).toBeAttached();
    }

    await context.close();
  });
});


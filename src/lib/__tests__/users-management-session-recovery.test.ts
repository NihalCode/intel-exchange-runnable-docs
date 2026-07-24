import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  authenticatedFetch,
  resetAuthenticatedFetchStateForTests,
  SESSION_RECOVERY_FAILED_MESSAGE,
  SESSION_RECOVERY_IN_PROGRESS_MESSAGE,
} from "@/lib/authenticated-fetch";

const panelSource = fs.readFileSync(
  path.join(process.cwd(), "src/components/auth/UsersManagementPanel.tsx"),
  "utf8"
);

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("UsersManagementPanel session recovery wiring", () => {
  it("uses authenticatedFetch for list and mutations", () => {
    expect(panelSource).toContain('from "@/lib/authenticated-fetch"');
    expect(panelSource).toContain("authenticatedFetch");
    expect(panelSource).toMatch(/authenticatedFetch\(\s*["']\/api\/users["']/);
    expect(panelSource).toMatch(
      /authenticatedFetch\(\s*`\/api\/users\/\$\{userId\}\/role`/
    );
    expect(panelSource).toMatch(
      /authenticatedFetch\(\s*`\/api\/users\/\$\{userId\}\/disable`/
    );
  });

  it("surfaces recovery UX copy and does not treat Okta/403/409 as session expiry", () => {
    expect(panelSource).toContain("SESSION_RECOVERY_IN_PROGRESS_MESSAGE");
    expect(panelSource).toContain("SESSION_RECOVERY_FAILED_MESSAGE");
    expect(panelSource).toContain("recoveryState");
    expect(panelSource).toContain("recovering");
    expect(panelSource).toContain('data.error ?? "User provisioning failed."');
    expect(panelSource).toContain("response.status === 403");
  });

  it("refreshes CSRF via prepareRetry after session recovery", () => {
    expect(panelSource).toContain("prepareRetry:");
    expect(panelSource).toContain("clearCsrf()");
    expect(panelSource).toContain("ensureCsrfToken");
    expect(panelSource).toContain("X-CSRF-Token");
    expect(panelSource).toContain("fetchUsersList");
  });

  it("loads CSRF from GET /api/users and clears cache on recovery", () => {
    expect(panelSource).toMatch(/authenticatedFetch\(\s*["']\/api\/users["']/);
    expect(panelSource).toContain('if (next === "recovering")');
    expect(panelSource).toContain("clearCsrf()");
    expect(panelSource).not.toMatch(/localStorage.*csrf/i);
  });
});

describe("Users mutation recovery behavior (authenticatedFetch contract)", () => {
  beforeEach(() => {
    resetAuthenticatedFetchStateForTests();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    resetAuthenticatedFetchStateForTests();
  });

  it("retries Add user once after SESSION_EXPIRED and refreshes CSRF before replay", async () => {
    const states: string[] = [];
    let postCount = 0;
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/auth/me") {
        return jsonResponse({ authenticated: true });
      }
      if (url === "/api/users" && (!init?.method || init.method === "GET")) {
        return jsonResponse({ users: [], csrfToken: "csrf-from-get" });
      }
      if (url === "/api/users" && init?.method === "POST") {
        postCount += 1;
        if (postCount === 1) {
          return jsonResponse(
            {
              error: "Session expired — sign in again",
              code: "SESSION_EXPIRED",
            },
            401
          );
        }
        const headers = new Headers(init.headers);
        expect(headers.get("X-CSRF-Token")).toBe("csrf-fresh");
        return jsonResponse({ message: "User added successfully." }, 201);
      }
      throw new Error(`unexpected ${url} ${init?.method}`);
    });

    const res = await authenticatedFetch("/api/users", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": "csrf-stale",
      },
      body: JSON.stringify({ email: "new@example.com", role: "viewer" }),
      redirectOnFailure: false,
      onRecoveryStateChange: (s) => states.push(s),
      prepareRetry: async (init) => {
        const csrfRes = await authenticatedFetch("/api/users", {
          method: "GET",
          redirectOnFailure: false,
        });
        const data = (await csrfRes.json()) as { csrfToken?: string };
        const headers = new Headers(init.headers);
        headers.set(
          "X-CSRF-Token",
          data.csrfToken === "csrf-from-get" ? "csrf-fresh" : "bad"
        );
        return { ...init, headers };
      },
    });

    expect(res.status).toBe(201);
    expect(postCount).toBe(2);
    expect(states).toEqual(["recovering", "idle"]);
  });

  it("does not double-submit when first response is 409 Okta conflict", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(
      jsonResponse(
        {
          error: "User already exists in Okta",
          code: "okta_user_exists",
          setupStatus: "existing_okta_user",
        },
        409
      )
    );

    const res = await authenticatedFetch("/api/users", {
      method: "POST",
      body: JSON.stringify({ email: "dup@example.com", role: "viewer" }),
      prepareRetry: async (init) => init,
    });

    expect(res.status).toBe(409);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not double-submit when first response is 403", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(jsonResponse({ error: "Forbidden" }, 403));

    const res = await authenticatedFetch("/api/users", {
      method: "POST",
      body: "{}",
    });
    expect(res.status).toBe(403);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("exports the failed-recovery message used by the panel", () => {
    expect(SESSION_RECOVERY_FAILED_MESSAGE).toMatch(/Redirecting to sign in/);
    expect(SESSION_RECOVERY_IN_PROGRESS_MESSAGE).toMatch(
      /Refreshing your secure session/
    );
    expect(panelSource).toContain("SESSION_RECOVERY_FAILED_MESSAGE");
    expect(panelSource).toContain("SESSION_RECOVERY_IN_PROGRESS_MESSAGE");
  });
});

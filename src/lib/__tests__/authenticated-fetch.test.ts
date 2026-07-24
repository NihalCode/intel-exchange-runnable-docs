import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  authenticatedFetch,
  isReplayableRequestBody,
  isSessionExpiredPayload,
  recoverAuthenticatedSession,
  resetAuthenticatedFetchStateForTests,
  SESSION_RECOVERY_FAILED_MESSAGE,
  SESSION_RECOVERY_IN_PROGRESS_MESSAGE,
} from "@/lib/authenticated-fetch";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("authenticated-fetch helpers", () => {
  it("detects SESSION_EXPIRED payloads", () => {
    expect(
      isSessionExpiredPayload(401, { code: "SESSION_EXPIRED" }, false)
    ).toBe(true);
    expect(isSessionExpiredPayload(401, { code: "OTHER" }, true)).toBe(false);
    expect(isSessionExpiredPayload(403, { code: "SESSION_EXPIRED" }, true)).toBe(
      false
    );
    expect(isSessionExpiredPayload(401, null, true)).toBe(true);
    expect(isSessionExpiredPayload(401, null, false)).toBe(false);
    expect(isSessionExpiredPayload(401, {}, true)).toBe(true);
  });

  it("only treats safely replayable bodies as replayable", () => {
    expect(isReplayableRequestBody(undefined)).toBe(true);
    expect(isReplayableRequestBody(null)).toBe(true);
    expect(isReplayableRequestBody('{"a":1}')).toBe(true);
    expect(isReplayableRequestBody(new URLSearchParams("a=1"))).toBe(true);
    expect(isReplayableRequestBody(new Blob(["x"]))).toBe(true);
    expect(isReplayableRequestBody(new FormData())).toBe(false);
    expect(isReplayableRequestBody(new ReadableStream())).toBe(false);
  });

  it("exports recovery UX copy", () => {
    expect(SESSION_RECOVERY_IN_PROGRESS_MESSAGE).toMatch(/Refreshing your secure session/);
    expect(SESSION_RECOVERY_FAILED_MESSAGE).toMatch(/could not be restored/);
  });
});

describe("authenticatedFetch", () => {
  beforeEach(() => {
    resetAuthenticatedFetchStateForTests();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    resetAuthenticatedFetchStateForTests();
  });

  it("returns a normal 200 without recovery", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }));
    const res = await authenticatedFetch("/api/users");
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]![1]).toMatchObject({
      credentials: "include",
      cache: "no-store",
    });
  });

  it("retries once after SESSION_EXPIRED when /api/auth/me recovers", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(
          {
            error: "Session expired — sign in again",
            code: "SESSION_EXPIRED",
            signIn: "/sign-in",
          },
          401
        )
      )
      .mockResolvedValueOnce(jsonResponse({ authenticated: true }))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));

    const states: string[] = [];
    const res = await authenticatedFetch("/api/users", {
      method: "POST",
      body: JSON.stringify({ email: "a@b.co" }),
      redirectOnFailure: false,
      onRecoveryStateChange: (s) => states.push(s),
    });

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain("/api/auth/me");
    expect(states).toEqual(["recovering", "idle"]);
  });

  it("does not retry a third time when retry is still 401", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ code: "SESSION_EXPIRED" }, 401))
      .mockResolvedValueOnce(jsonResponse({ authenticated: true }))
      .mockResolvedValueOnce(jsonResponse({ code: "SESSION_EXPIRED" }, 401));

    const res = await authenticatedFetch("/api/users", {
      redirectOnFailure: false,
    });
    expect(res.status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("does not retry 403", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(jsonResponse({ code: "FORBIDDEN" }, 403));
    const res = await authenticatedFetch("/api/users");
    expect(res.status).toBe(403);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not retry 409, 429, or 502", async () => {
    const fetchMock = vi.mocked(fetch);
    for (const status of [409, 429, 502]) {
      fetchMock.mockResolvedValueOnce(jsonResponse({ error: "x" }, status));
      expect((await authenticatedFetch("/api/users")).status).toBe(status);
    }
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("shares one recovery probe across concurrent SESSION_EXPIRED calls", async () => {
    const fetchMock = vi.mocked(fetch);
    let meCalls = 0;
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/api/auth/me")) {
        meCalls += 1;
        return jsonResponse({ authenticated: true });
      }
      if (meCalls === 0) {
        return jsonResponse({ code: "SESSION_EXPIRED" }, 401);
      }
      return jsonResponse({ ok: true });
    });

    const [a, b] = await Promise.all([
      authenticatedFetch("/api/users", { redirectOnFailure: false }),
      authenticatedFetch("/api/users", { redirectOnFailure: false }),
    ]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(meCalls).toBe(1);
  });

  it("calls prepareRetry so CSRF can refresh after recovery", async () => {
    const prepareRetry = vi.fn(async (init: RequestInit) => ({
      ...init,
      headers: {
        ...(init.headers as Record<string, string>),
        "X-CSRF-Token": "fresh",
      },
    }));
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ code: "SESSION_EXPIRED" }, 401))
      .mockResolvedValueOnce(jsonResponse({ authenticated: true }))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));

    await authenticatedFetch("/api/users", {
      method: "POST",
      headers: { "X-CSRF-Token": "stale" },
      body: "{}",
      prepareRetry,
      redirectOnFailure: false,
    });

    expect(prepareRetry).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[2]![1]?.headers).toMatchObject({
      "X-CSRF-Token": "fresh",
    });
  });

  it("does not retry when body is a non-replayable stream", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(jsonResponse({ code: "SESSION_EXPIRED" }, 401));

    const res = await authenticatedFetch("/api/users", {
      method: "POST",
      body: new ReadableStream(),
      redirectOnFailure: false,
    });
    expect(res.status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("redirects once after failed recovery and leaves state failed", async () => {
    const assign = vi.fn();
    const states: string[] = [];
    vi.stubGlobal("window", {
      location: { pathname: "/users", search: "", assign },
    });
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(
          { code: "SESSION_EXPIRED", signIn: "/sign-in?returnTo=%2Fusers" },
          401
        )
      )
      .mockResolvedValueOnce(jsonResponse({ authenticated: false }));

    const res = await authenticatedFetch("/api/users", {
      onRecoveryStateChange: (s) => states.push(s),
    });

    expect(res.status).toBe(401);
    expect(assign).toHaveBeenCalledTimes(1);
    expect(assign.mock.calls[0]![0]).toContain("/sign-in");
    expect(states).toEqual(["recovering", "failed"]);
  });

  it("does not redirect twice within the same failed-recovery cycle", async () => {
    const assign = vi.fn();
    vi.stubGlobal("window", {
      location: { pathname: "/users", search: "", assign },
    });
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/api/auth/me")) {
        return jsonResponse({ authenticated: false });
      }
      return jsonResponse({ code: "SESSION_EXPIRED", signIn: "/sign-in" }, 401);
    });

    await Promise.all([
      authenticatedFetch("/api/users"),
      authenticatedFetch("/api/users"),
    ]);

    expect(assign).toHaveBeenCalledTimes(1);
  });

  it("treats bare 401 on /api/users as recoverable", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ error: "Unauthorized" }, 401))
      .mockResolvedValueOnce(jsonResponse({ authenticated: true }))
      .mockResolvedValueOnce(jsonResponse({ users: [] }));

    const res = await authenticatedFetch("/api/users", {
      redirectOnFailure: false,
    });
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("does not treat bare 401 as recoverable when disabled", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(jsonResponse({ error: "Unauthorized" }, 401));

    const res = await authenticatedFetch("/api/other", {
      treatBare401AsSessionExpired: false,
      redirectOnFailure: false,
    });
    expect(res.status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not swallow network failures as session expiry", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockRejectedValue(new TypeError("network down"));

    await expect(authenticatedFetch("/api/users")).rejects.toThrow(/network down/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("recoverAuthenticatedSession", () => {
  beforeEach(() => {
    resetAuthenticatedFetchStateForTests();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    resetAuthenticatedFetchStateForTests();
  });

  it("returns false when /api/auth/me is unauthenticated", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ authenticated: false }));
    expect(await recoverAuthenticatedSession()).toBe(false);
  });
});

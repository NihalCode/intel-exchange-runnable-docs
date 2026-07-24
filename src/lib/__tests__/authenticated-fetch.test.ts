import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  authenticatedFetch,
  isReplayableRequestBody,
  isSessionExpiredPayload,
  resetAuthenticatedFetchStateForTests,
} from "@/lib/authenticated-fetch";

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
    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 200 }));
    const res = await authenticatedFetch("/api/users");
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries once after SESSION_EXPIRED when /api/auth/me recovers", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: "Session expired — sign in again",
            code: "SESSION_EXPIRED",
            signIn: "/sign-in",
          }),
          { status: 401 }
        )
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ authenticated: true }), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), { status: 200 })
      );

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
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ code: "SESSION_EXPIRED" }), {
          status: 401,
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ authenticated: true }), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ code: "SESSION_EXPIRED" }), {
          status: 401,
        })
      );

    const res = await authenticatedFetch("/api/users", {
      redirectOnFailure: false,
    });
    expect(res.status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("does not retry 403", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ code: "FORBIDDEN" }), { status: 403 })
    );
    const res = await authenticatedFetch("/api/users");
    expect(res.status).toBe(403);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not retry 409 or 502", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "conflict" }), { status: 409 })
    );
    expect((await authenticatedFetch("/api/users")).status).toBe(409);
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "bad gateway" }), { status: 502 })
    );
    expect((await authenticatedFetch("/api/users")).status).toBe(502);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("shares one recovery probe across concurrent SESSION_EXPIRED calls", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/api/auth/me")) {
        return new Response(JSON.stringify({ authenticated: true }), {
          status: 200,
        });
      }
      if (fetchMock.mock.calls.filter((c) => !String(c[0]).includes("/api/auth/me")).length <= 2) {
        return new Response(JSON.stringify({ code: "SESSION_EXPIRED" }), {
          status: 401,
        });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });

    const [a, b] = await Promise.all([
      authenticatedFetch("/api/users", { redirectOnFailure: false }),
      authenticatedFetch("/api/users", { redirectOnFailure: false }),
    ]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    const meCalls = fetchMock.mock.calls.filter((c) =>
      String(c[0]).includes("/api/auth/me")
    );
    expect(meCalls.length).toBe(1);
  });

  it("classifies SESSION_EXPIRED payloads", () => {
    expect(
      isSessionExpiredPayload(401, { code: "SESSION_EXPIRED" }, false)
    ).toBe(true);
    expect(isSessionExpiredPayload(401, null, true)).toBe(true);
    expect(isSessionExpiredPayload(403, { code: "SESSION_EXPIRED" }, true)).toBe(
      false
    );
  });

  it("treats JSON string bodies as replayable", () => {
    expect(isReplayableRequestBody(JSON.stringify({ a: 1 }))).toBe(true);
    expect(isReplayableRequestBody(null)).toBe(true);
  });
});

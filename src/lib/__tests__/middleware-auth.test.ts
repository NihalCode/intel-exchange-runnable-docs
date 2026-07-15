import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const getSession = vi.fn();

vi.mock("@/lib/auth0", () => ({
  getAuth0: () => ({ getSession }),
}));

vi.mock("@/lib/documentation-auth/env", () => ({
  isAuthEnvComplete: () => true,
}));

vi.mock("@/lib/documentation-auth/config", () => ({
  isAuthDisabled: () => false,
}));

import { getMiddlewareAuthUser } from "@/lib/documentation-auth/middleware-auth";

function agentRequest(): NextRequest {
  return new NextRequest("https://docs.example.com/api/agent", { method: "POST" });
}

describe("getMiddlewareAuthUser (agent chat Unauthorized regression)", () => {
  afterEach(() => {
    getSession.mockReset();
  });

  it("authenticates a session that has sub but no top-level email", async () => {
    // Regression: the edge gate used to require BOTH sub and email, so a valid
    // Auth0 session whose user object lacked a top-level email returned null →
    // hard 401 "Unauthorized" before the route handler (which can recover email
    // from the ID token) ever ran.
    getSession.mockResolvedValue({ user: { sub: "auth0|user-123" } });

    const user = await getMiddlewareAuthUser(agentRequest());

    expect(user).not.toBeNull();
    expect(user?.sub).toBe("auth0|user-123");
    expect(user?.email).toBeNull();
  });

  it("passes through the email when present", async () => {
    getSession.mockResolvedValue({
      user: { sub: "auth0|user-123", email: "user@company.com" },
    });

    const user = await getMiddlewareAuthUser(agentRequest());

    expect(user?.email).toBe("user@company.com");
  });

  it("returns null when there is no authenticated session", async () => {
    getSession.mockResolvedValue(null);

    expect(await getMiddlewareAuthUser(agentRequest())).toBeNull();
  });

  it("returns null when the session has no subject", async () => {
    getSession.mockResolvedValue({ user: { email: "user@company.com" } });

    expect(await getMiddlewareAuthUser(agentRequest())).toBeNull();
  });
});

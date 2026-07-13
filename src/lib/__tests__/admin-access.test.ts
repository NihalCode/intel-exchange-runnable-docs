import { describe, expect, it } from "vitest";

import type { AppSession } from "@/lib/documentation-auth/session";
import { evaluateAdminAccess } from "@/lib/enterprise/admin-access";

function session(overrides: Partial<AppSession> = {}): AppSession {
  return {
    authProvider: "auth0",
    claims: {
      authTime: Math.floor(Date.now() / 1000),
      amr: ["pwd", "mfa"],
      acr: "urn:mfa",
    },
    user: {
      id: "user-1",
      auth0UserId: "auth0|user-1",
      email: "owner@enterprise.test",
      name: "Owner",
      role: "owner",
      status: "active",
    },
    ...overrides,
  };
}

describe("evaluateAdminAccess", () => {
  it("denies null sessions", async () => {
    const result = await evaluateAdminAccess(null);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("no_session");
  });
});

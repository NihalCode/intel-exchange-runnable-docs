import { describe, expect, it } from "vitest";

import { authReturnToFromPath } from "@/lib/documentation-auth/auth-return-to-path";

describe("authReturnToFromPath", () => {
  it("keeps documentation paths", () => {
    expect(authReturnToFromPath("/")).toBe("/");
    expect(authReturnToFromPath("/docs/ctix/ping")).toBe("/docs/ctix/ping");
    expect(authReturnToFromPath("/admin/documentation-agent/deployments")).toBe(
      "/admin/documentation-agent/deployments"
    );
  });

  it("rejects auth UX paths so users land on home after sign-in", () => {
    expect(authReturnToFromPath("/sign-in")).toBe("/");
    expect(authReturnToFromPath("/sign-in?error=auth_failed")).toBe("/");
    expect(authReturnToFromPath("/auth/login")).toBe("/");
    expect(authReturnToFromPath("/access/invite-required")).toBe("/");
    expect(authReturnToFromPath("/post-login")).toBe("/");
    expect(authReturnToFromPath("/invite")).toBe("/");
  });

  it("rejects open redirects", () => {
    expect(authReturnToFromPath("//evil.example")).toBe("/");
    expect(authReturnToFromPath("https://evil.example")).toBe("/");
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { guardAskAgent } from "../documentation-auth/guard-api";

describe("guardAskAgent local preview", () => {
  const origAuthDisabled = process.env.AUTH_DISABLED;
  const origDevToken = process.env.DEVELOPER_ACCESS_TOKEN;

  afterEach(() => {
    vi.unstubAllEnvs();
    if (origAuthDisabled === undefined) delete process.env.AUTH_DISABLED;
    else process.env.AUTH_DISABLED = origAuthDisabled;
    if (origDevToken === undefined) delete process.env.DEVELOPER_ACCESS_TOKEN;
    else process.env.DEVELOPER_ACCESS_TOKEN = origDevToken;
  });

  it("allows Ask AI without DEVELOPER_ACCESS_TOKEN when AUTH_DISABLED in development", async () => {
    vi.stubEnv("AUTH_DISABLED", "true");
    vi.stubEnv("NODE_ENV", "development");
    delete process.env.DEVELOPER_ACCESS_TOKEN;

    const req = new NextRequest("http://localhost:3000/api/agent");
    const session = await guardAskAgent(req);
    expect(session).not.toBeInstanceOf(Response);
    if (!(session instanceof Response)) {
      expect(session.user.role).toBe("owner");
      expect(["disabled", "test"]).toContain(session.authProvider);
    }
  });

  it("does not expose DEVELOPER_ACCESS_TOKEN when developer token missing in production", async () => {
    vi.stubEnv("AUTH_DISABLED", "true");
    vi.stubEnv("NODE_ENV", "production");
    delete process.env.DEVELOPER_ACCESS_TOKEN;

    const req = new NextRequest("http://localhost:3000/api/agent");
    const session = await guardAskAgent(req);
    expect(session).toBeInstanceOf(Response);
    if (session instanceof Response) {
      const body = (await session.json()) as { error?: string };
      expect(body.error).not.toMatch(/DEVELOPER_ACCESS_TOKEN/);
      expect(body.error).toMatch(/administrator|available/i);
    }
  });
});

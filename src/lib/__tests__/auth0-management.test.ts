import { afterEach, describe, expect, it, vi } from "vitest";

import { Auth0ProvisioningError } from "@/lib/auth0-management/errors";
import {
  canProvisionRole,
  provisionAuth0User,
} from "@/lib/auth0-management/service";

describe("direct Auth0 provisioning", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    for (const key of [
      "AUTH0_ISSUER_BASE_URL",
      "AUTH0_MANAGEMENT_CLIENT_ID",
      "AUTH0_MANAGEMENT_CLIENT_SECRET",
      "AUTH0_DATABASE_CONNECTION",
      "APP_BASE_URL",
    ]) {
      delete process.env[key];
    }
  });

  it("enforces role hierarchy", () => {
    expect(canProvisionRole("developer", "admin")).toBe(false);
    expect(canProvisionRole("developer", "owner")).toBe(false);
    expect(canProvisionRole("admin", "owner")).toBe(false);
    expect(canProvisionRole("admin", "developer")).toBe(true);
    expect(canProvisionRole("owner", "admin")).toBe(true);
  });

  it("throws when management API is not configured", async () => {
    await expect(provisionAuth0User({ email: "user@example.com" })).rejects.toBeInstanceOf(
      Auth0ProvisioningError
    );
  });

  it("uses provider-managed setup without accepting or returning a password", async () => {
    process.env.AUTH0_ISSUER_BASE_URL = "https://tenant.auth0.com";
    process.env.AUTH0_MANAGEMENT_CLIENT_ID = "management-client";
    process.env.AUTH0_MANAGEMENT_CLIENT_SECRET = "management-secret";
    process.env.AUTH0_DATABASE_CONNECTION = "Username-Password-Authentication";
    process.env.APP_BASE_URL = "https://docs.example.com";
    const bodies: string[] = [];
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      if (typeof init?.body === "string") bodies.push(init.body);
      const call = bodies.length;
      if (call === 1) return Response.json({ access_token: "token" });
      if (call === 2) {
        return Response.json(
          { user_id: "auth0|new-user", email: "user@example.com" },
          { status: 201 }
        );
      }
      return Response.json({ ticket: "https://tenant.auth0.com/setup/private" });
    });
    vi.stubGlobal("fetch", fetchMock);
    const result = await provisionAuth0User({ email: "user@example.com" });
    expect(result.user.user_id).toBe("auth0|new-user");
    expect(result.setupStatus).toBe("provider_setup_created");
    expect(JSON.stringify(result)).not.toContain("ticket");
    expect(bodies.join("\n")).not.toMatch(/"password"\s*:/);
  });
});

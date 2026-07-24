import { afterEach, describe, expect, it, vi } from "vitest";

import {
  canProvisionRole,
  provisionAuth0User,
} from "@/lib/auth0-management/service";
import { provisionalAuth0UserIdForEmail } from "@/lib/identity/broker-user-id";
import { OktaProvisioningError } from "@/lib/okta/errors";

describe("Add user provisioning (Okta-only)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    for (const key of [
      "OKTA_ORG_URL",
      "OKTA_API_TOKEN",
      "OKTA_APP_ID",
      "OKTA_DOCS_GROUP_ID",
      "AUTH0_OKTA_CONNECTION",
    ]) {
      delete process.env[key];
    }
  });

  it("enforces role hierarchy", () => {
    expect(canProvisionRole("admin", "developer")).toBe(true);
    expect(canProvisionRole("admin", "owner")).toBe(false);
  });

  it("fails closed when Okta provisioning is not configured", async () => {
    await expect(provisionAuth0User({ email: "user@example.com" })).rejects.toBeInstanceOf(
      OktaProvisioningError
    );
  });

  it("returns new_user_activation_email_sent and provisional id", async () => {
    process.env.OKTA_ORG_URL = "https://example.okta.com";
    process.env.OKTA_API_TOKEN = "ssws-test";
    process.env.OKTA_DOCS_GROUP_ID = "00gDocs";
    process.env.AUTH0_OKTA_CONNECTION = "okta-workforce";

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? "GET").toUpperCase();
      if (url.includes("auth0.com") || url.includes("/api/v2")) {
        return new Response("Auth0 Management must not be called", { status: 500 });
      }
      if (url.endsWith("/users/user%40example.com") && method === "GET") {
        return new Response(null, { status: 404 });
      }
      if (url.includes("/users?activate=false") && method === "POST") {
        return Response.json({
          id: "okta-user-1",
          status: "STAGED",
          profile: { email: "user@example.com", login: "user@example.com" },
        });
      }
      if (url.includes("/groups/00gDocs/users/okta-user-1") && method === "PUT") {
        return new Response(null, { status: 204 });
      }
      if (url.endsWith("/users/okta-user-1/groups") && method === "GET") {
        return Response.json([{ id: "00gDocs" }]);
      }
      if (url.includes("/lifecycle/activate") && method === "POST") {
        return new Response(null, { status: 200 });
      }
      return new Response(`unexpected ${method} ${url}`, { status: 500 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await provisionAuth0User({ email: "user@example.com" });
    expect(result.setupStatus).toBe("new_user_activation_email_sent");
    expect(result.user.user_id).toBe(provisionalAuth0UserIdForEmail("user@example.com"));
    expect(result.blocked).toBe(false);
  });

  it("preserves existing live Auth0 sub", async () => {
    process.env.OKTA_ORG_URL = "https://example.okta.com";
    process.env.OKTA_API_TOKEN = "ssws-test";
    process.env.OKTA_DOCS_GROUP_ID = "00gDocs";

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? "GET").toUpperCase();
      if (url.endsWith("/users/user%40example.com") && method === "GET") {
        return Response.json({
          id: "00uActive",
          status: "ACTIVE",
          profile: { email: "user@example.com", login: "user@example.com" },
        });
      }
      if (url.includes("/groups/00gDocs/users/00uActive") && method === "PUT") {
        return new Response(null, { status: 204 });
      }
      if (url.endsWith("/users/00uActive/groups") && method === "GET") {
        return Response.json([{ id: "00gDocs" }]);
      }
      return new Response(`unexpected ${method} ${url}`, { status: 500 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await provisionAuth0User({
      email: "user@example.com",
      existingAuth0UserId: "oidc|okta|user",
    });
    expect(result.setupStatus).toBe("existing_active_access_granted");
    expect(result.user.user_id).toBe("oidc|okta|user");
  });
});

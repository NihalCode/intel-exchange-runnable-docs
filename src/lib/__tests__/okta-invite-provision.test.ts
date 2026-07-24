import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getAuth0OktaConnection,
  getAuthCookieDomain,
  shouldSkipIdpProvision,
} from "@/lib/auth0-management/invite-provision";
import { provisionAuth0User } from "@/lib/auth0-management/service";
import {
  auth0UserIdForLoginLink,
  provisionalAuth0UserIdForEmail,
} from "@/lib/identity/broker-user-id";
import {
  isOktaOnlySignIn,
  isOktaProvisioningConfigured,
} from "@/lib/okta/config";
import { OktaProvisioningError } from "@/lib/okta/errors";
import { addUserOutcomeMessage } from "@/lib/okta/outcome-messages";

describe("Okta-first invite provision", () => {
  afterEach(() => {
    for (const key of [
      "AUTH0_OKTA_CONNECTION",
      "INVITE_SKIP_IDP_PROVISION",
      "CROSS_DOMAIN_SSO_ENABLED",
      "AUTH_COOKIE_DOMAIN",
      "OKTA_ORG_URL",
      "OKTA_API_TOKEN",
      "OKTA_APP_ID",
      "OKTA_DOCS_GROUP_ID",
      "OKTA_GROUP_ID",
      "OKTA_DOCS_GROUP_NAME",
      "OKTA_GROUP_NAME",
    ]) {
      delete process.env[key];
    }
    vi.unstubAllGlobals();
  });

  it("exposes AUTH0_OKTA_CONNECTION for broker login", () => {
    process.env.AUTH0_OKTA_CONNECTION = "okta";
    expect(shouldSkipIdpProvision()).toBe(false);
    expect(getAuth0OktaConnection()).toBe("okta");
    expect(isOktaOnlySignIn()).toBe(true);
  });

  it("isOktaProvisioningConfigured accepts docs group without app id", () => {
    process.env.OKTA_ORG_URL = "https://example.okta.com";
    process.env.OKTA_API_TOKEN = "ssws-test";
    process.env.OKTA_DOCS_GROUP_ID = "00gDocs";
    expect(isOktaProvisioningConfigured()).toBe(true);
  });

  it("provisionAuth0User fails closed without Okta API config", async () => {
    await expect(
      provisionAuth0User({ email: "alice@example.com", displayName: "Alice" })
    ).rejects.toBeInstanceOf(OktaProvisioningError);
  });

  it("provisionAuth0User activates new users after group assignment", async () => {
    process.env.OKTA_ORG_URL = "https://example.okta.com";
    process.env.OKTA_API_TOKEN = "ssws-test";
    process.env.OKTA_APP_ID = "0oaTestApp";
    process.env.OKTA_DOCS_GROUP_ID = "00gDocsUsers";
    process.env.AUTH0_OKTA_CONNECTION = "test-okta-workforce";

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? "GET").toUpperCase();
      if (url.endsWith("/users/alice%40example.com") && method === "GET") {
        return new Response(null, { status: 404 });
      }
      if (url.includes("/users?activate=false") && method === "POST") {
        return Response.json({
          id: "okta-user-1",
          status: "STAGED",
          profile: { email: "alice@example.com", login: "alice@example.com" },
        });
      }
      if (url.includes("/groups/00gDocsUsers/users/okta-user-1") && method === "PUT") {
        return new Response(null, { status: 204 });
      }
      if (url.endsWith("/users/okta-user-1/groups") && method === "GET") {
        return Response.json([{ id: "00gDocsUsers" }]);
      }
      if (url.includes("/apps/0oaTestApp/users") && method === "POST") {
        return Response.json(
          {
            errorSummary:
              "It is not possible to assign users to an AppInstance that has Federation Broker Mode enabled",
          },
          { status: 400 }
        );
      }
      if (url.includes("/lifecycle/activate") && method === "POST") {
        return new Response(null, { status: 200 });
      }
      return new Response(`unexpected ${method} ${url}`, { status: 500 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await provisionAuth0User({
      email: "alice@example.com",
      displayName: "Alice Example",
    });
    expect(result.setupStatus).toBe("new_user_activation_email_sent");
    expect(result.user.user_id).toBe(provisionalAuth0UserIdForEmail("alice@example.com"));
    expect(addUserOutcomeMessage(result.setupStatus)).toMatch(/setup email/i);
  });

  it("exposes AUTH_COOKIE_DOMAIN only when CROSS_DOMAIN_SSO_ENABLED", () => {
    process.env.AUTH_COOKIE_DOMAIN = ".cyninjadev.com";
    expect(getAuthCookieDomain()).toBeUndefined();
    process.env.CROSS_DOMAIN_SSO_ENABLED = "true";
    expect(getAuthCookieDomain()).toBe(".cyninjadev.com");
  });
});

describe("auth0UserIdForLoginLink", () => {
  it("links provisional invite placeholder to live Okta sub", () => {
    const provisional = provisionalAuth0UserIdForEmail("alice@example.com");
    expect(
      auth0UserIdForLoginLink(provisional, "alice@example.com", "oidc|okta|alice")
    ).toBe("oidc|okta|alice");
  });

  it("preserves mismatch provisional", () => {
    const other = provisionalAuth0UserIdForEmail("other@example.com");
    expect(
      auth0UserIdForLoginLink(other, "alice@example.com", "oidc|okta|alice")
    ).toBe(other);
  });
});

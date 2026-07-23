import { afterEach, describe, expect, it } from "vitest";

import {
  getAuth0OktaConnection,
  getAuthCookieDomain,
  shouldSkipIdpProvision,
} from "@/lib/auth0-management/invite-provision";
import {
  auth0UserIdForLoginLink,
  provisionalAuth0UserIdForEmail,
} from "@/lib/auth0-management/errors";
import { provisionAuth0User } from "@/lib/auth0-management/service";

describe("Okta-first invite provision", () => {
  afterEach(() => {
    for (const key of [
      "AUTH0_OKTA_CONNECTION",
      "INVITE_SKIP_IDP_PROVISION",
      "CROSS_DOMAIN_SSO_ENABLED",
      "AUTH_COOKIE_DOMAIN",
      "AUTH0_ISSUER_BASE_URL",
      "AUTH0_MANAGEMENT_CLIENT_ID",
      "AUTH0_MANAGEMENT_CLIENT_SECRET",
    ]) {
      delete process.env[key];
    }
  });

  it("does not skip IdP provision merely because AUTH0_OKTA_CONNECTION is set", () => {
    process.env.AUTH0_OKTA_CONNECTION = "okta";
    expect(shouldSkipIdpProvision()).toBe(false);
    expect(getAuth0OktaConnection()).toBe("okta");
  });

  it("skips IdP provision only when INVITE_SKIP_IDP_PROVISION=true", () => {
    process.env.AUTH0_OKTA_CONNECTION = "okta";
    process.env.INVITE_SKIP_IDP_PROVISION = "true";
    expect(shouldSkipIdpProvision()).toBe(true);
  });

  it("honors INVITE_SKIP_IDP_PROVISION=false", () => {
    process.env.INVITE_SKIP_IDP_PROVISION = "false";
    expect(shouldSkipIdpProvision()).toBe(false);
  });

  it("provisionAuth0User returns provisional id without Management API when skip is on", async () => {
    process.env.INVITE_SKIP_IDP_PROVISION = "true";
    const result = await provisionAuth0User({
      email: "alice@example.com",
      displayName: "Alice",
    });
    expect(result.setupStatus).toBe("okta_invite_pending");
    expect(result.user.user_id).toBe(provisionalAuth0UserIdForEmail("alice@example.com"));
    expect(result.user.email).toBe("alice@example.com");
  });

  it("exposes AUTH_COOKIE_DOMAIN only when CROSS_DOMAIN_SSO_ENABLED", () => {
    process.env.AUTH_COOKIE_DOMAIN = ".cyninjadev.com";
    expect(getAuthCookieDomain()).toBeUndefined();
    process.env.CROSS_DOMAIN_SSO_ENABLED = "true";
    expect(getAuthCookieDomain()).toBe(".cyninjadev.com");
    process.env.AUTH_COOKIE_DOMAIN = "cyninjadev.com";
    expect(getAuthCookieDomain()).toBe(".cyninjadev.com");
  });
});

describe("auth0UserIdForLoginLink (Okta dual-login)", () => {
  it("links provisional invite placeholder to live Okta sub", () => {
    const provisional = provisionalAuth0UserIdForEmail("alice@example.com");
    expect(
      auth0UserIdForLoginLink(provisional, "alice@example.com", "oidc|okta|alice")
    ).toBe("oidc|okta|alice");
  });

  it("relinks Database-provisioned user to Okta enterprise sub (same email)", () => {
    expect(
      auth0UserIdForLoginLink("auth0|db-user-123", "alice@example.com", "oidc|okta|alice")
    ).toBe("oidc|okta|alice");
  });

  it("relinks Okta user back to Database sub on email/password login", () => {
    expect(
      auth0UserIdForLoginLink("oidc|okta|alice", "alice@example.com", "auth0|db-user-123")
    ).toBe("auth0|db-user-123");
  });

  it("refuses provisional link when email hash does not match stored id", () => {
    const other = provisionalAuth0UserIdForEmail("other@example.com");
    expect(
      auth0UserIdForLoginLink(other, "alice@example.com", "oidc|okta|alice")
    ).toBe(other);
  });
});

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { resolveAppBaseUrlFromEnv } from "@/lib/documentation-auth/base-url";
import { buildAuthSetupStatus } from "@/lib/documentation-auth/setup-status";

describe("resolveAppBaseUrlFromEnv", () => {
  const backup = { ...process.env };

  beforeEach(() => {
    process.env = { ...backup };
    delete process.env.APP_BASE_URL;
    delete process.env.AUTH0_BASE_URL;
    delete process.env.VERCEL_URL;
    delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
    delete process.env.VERCEL_BRANCH_URL;
  });

  afterEach(() => {
    process.env = { ...backup };
  });

  it("prefers APP_BASE_URL", () => {
    process.env.APP_BASE_URL = "https://cyware-docs-ctix.vercel.app/";
    expect(resolveAppBaseUrlFromEnv()).toBe("https://cyware-docs-ctix.vercel.app");
  });

  it("falls back to VERCEL_URL on Vercel", () => {
    process.env.VERCEL_URL = "cyware-docs-csap.vercel.app";
    expect(resolveAppBaseUrlFromEnv()).toBe("https://cyware-docs-csap.vercel.app");
  });
});

describe("buildAuthSetupStatus", () => {
  const backup = { ...process.env };

  beforeEach(() => {
    process.env = { ...backup };
    delete process.env.AUTH0_ISSUER_BASE_URL;
    delete process.env.AUTH0_CLIENT_ID;
    delete process.env.AUTH0_CLIENT_SECRET;
    delete process.env.AUTH0_SECRET;
    delete process.env.AUTH0_OKTA_CONNECTION;
    delete process.env.APP_BASE_URL;
    delete process.env.VERCEL_URL;
  });

  afterEach(() => {
    process.env = { ...backup };
  });

  it("lists missing Auth0 keys for sign-in", () => {
    process.env.VERCEL = "1";
    process.env.VERCEL_URL = "cyware-docs-ctix.vercel.app";
    const status = buildAuthSetupStatus();
    expect(status.authReady).toBe(false);
    expect(status.missingForSignIn).toContain("AUTH0_CLIENT_ID");
    expect(status.deployment.resolvedAppBaseUrl).toBe(
      "https://cyware-docs-ctix.vercel.app"
    );
  });

  it("reports auth ready when Auth0 env is complete", () => {
    process.env.AUTH0_ISSUER_BASE_URL = "https://tenant.auth0.com";
    process.env.AUTH0_CLIENT_ID = "client";
    process.env.AUTH0_CLIENT_SECRET = "secret";
    process.env.AUTH0_SECRET = "a".repeat(32);
    process.env.AUTH0_OKTA_CONNECTION = "test-okta-workforce";
    process.env.VERCEL_URL = "cyware-docs-ctix.vercel.app";
    const status = buildAuthSetupStatus({ databaseConnected: true });
    expect(status.authReady).toBe(true);
    expect(status.missingForSignIn).toEqual([]);
  });

  it("lists AUTH0_OKTA_CONNECTION when missing", () => {
    process.env.AUTH0_ISSUER_BASE_URL = "https://tenant.auth0.com";
    process.env.AUTH0_CLIENT_ID = "client";
    process.env.AUTH0_CLIENT_SECRET = "secret";
    process.env.AUTH0_SECRET = "a".repeat(32);
    process.env.VERCEL_URL = "cyware-docs-ctix.vercel.app";
    const status = buildAuthSetupStatus();
    expect(status.authReady).toBe(false);
    expect(status.missingForSignIn).toContain("AUTH0_OKTA_CONNECTION");
  });
});

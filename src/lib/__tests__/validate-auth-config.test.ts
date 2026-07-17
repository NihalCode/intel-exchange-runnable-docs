import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { validateAuthConfig } from "@/lib/documentation-auth/validate-auth-config";

describe("validateAuthConfig", () => {
  const envBackup = { ...process.env };

  beforeEach(() => {
    process.env = { ...envBackup };
    delete process.env.AUTH0_ISSUER_BASE_URL;
    delete process.env.AUTH0_CLIENT_ID;
    delete process.env.AUTH0_CLIENT_SECRET;
    delete process.env.AUTH0_SECRET;
    delete process.env.APP_BASE_URL;
    delete process.env.AUTH0_BASE_URL;
    delete process.env.AUTH0_ACTION_SHARED_SECRET;
    delete process.env.DATABASE_URL;
    delete process.env.INITIAL_OWNER_EMAIL;
    delete process.env.VERCEL;
  });

  afterEach(() => {
    process.env = { ...envBackup };
  });

  it("reports missing Auth0 env", () => {
    const result = validateAuthConfig();
    expect(result.ok).toBe(false);
    expect(result.checks.auth0EnvComplete).toBe(false);
    expect(result.issues.some((i) => i.includes("Auth0 env incomplete"))).toBe(true);
  });

  it("reports short AUTH0_SECRET", () => {
    process.env.AUTH0_ISSUER_BASE_URL = "https://tenant.auth0.com";
    process.env.AUTH0_CLIENT_ID = "client";
    process.env.AUTH0_CLIENT_SECRET = "secret";
    process.env.AUTH0_SECRET = "short";
    process.env.APP_BASE_URL = "https://app.example.com";
    process.env.AUTH0_ACTION_SHARED_SECRET = "action-secret-at-least-32-characters-long";

    const result = validateAuthConfig();
    expect(result.ok).toBe(false);
    expect(result.checks.auth0SecretValid).toBe(false);
    expect(result.issues.some((i) => i.includes("32 characters"))).toBe(true);
  });

  it("reports Vercel without DATABASE_URL", () => {
    process.env.AUTH0_ISSUER_BASE_URL = "https://tenant.auth0.com";
    process.env.AUTH0_CLIENT_ID = "client";
    process.env.AUTH0_CLIENT_SECRET = "secret";
    process.env.AUTH0_SECRET = "a".repeat(32);
    process.env.APP_BASE_URL = "https://app.example.com";
    process.env.AUTH0_ACTION_SHARED_SECRET = "action-secret-at-least-32-characters-long";
    process.env.VERCEL = "1";

    const result = validateAuthConfig();
    expect(result.checks.vercelWithoutDatabase).toBe(true);
    expect(result.issues.some((i) => i.includes("DATABASE_URL is unset on Vercel"))).toBe(true);
  });

  it("passes with complete configuration", () => {
    process.env.AUTH0_ISSUER_BASE_URL = "https://tenant.auth0.com";
    process.env.AUTH0_CLIENT_ID = "client";
    process.env.AUTH0_CLIENT_SECRET = "secret";
    process.env.AUTH0_SECRET = "a".repeat(32);
    process.env.APP_BASE_URL = "https://app.example.com";
    process.env.AUTH0_ACTION_SHARED_SECRET = "action-secret-at-least-32-characters-long";
    process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/docs";
    process.env.INITIAL_OWNER_EMAIL = "owner@company.com";

    const result = validateAuthConfig();
    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([]);
    expect(result.checks.initialOwnerEmailSource).toBe("INITIAL_OWNER_EMAIL");
  });

  it("accepts VERCEL_URL when APP_BASE_URL is unset", () => {
    process.env.AUTH0_ISSUER_BASE_URL = "https://tenant.auth0.com";
    process.env.AUTH0_CLIENT_ID = "client";
    process.env.AUTH0_CLIENT_SECRET = "secret";
    process.env.AUTH0_SECRET = "a".repeat(32);
    process.env.VERCEL_URL = "cyware-docs-ctix.vercel.app";
    process.env.AUTH0_ACTION_SHARED_SECRET = "action-secret-at-least-32-characters-long";
    process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/docs";

    const result = validateAuthConfig();
    expect(result.checks.auth0EnvComplete).toBe(true);
    expect(result.checks.appBaseUrlSet).toBe(true);
  });
});

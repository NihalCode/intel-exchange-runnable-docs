import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildAuthRuntimeStatus } from "@/lib/documentation-auth/auth-runtime-status";
import { normalizeDatabaseUrl } from "@/lib/db/client";

describe("buildAuthRuntimeStatus", () => {
  const backup = { ...process.env };

  beforeEach(() => {
    process.env = { ...backup };
    delete process.env.AUTH0_ISSUER_BASE_URL;
    delete process.env.AUTH0_CLIENT_ID;
    delete process.env.AUTH0_CLIENT_SECRET;
    delete process.env.AUTH0_SECRET;
    delete process.env.APP_BASE_URL;
    delete process.env.AUTH0_BASE_URL;
    delete process.env.VERCEL_URL;
    delete process.env.DATABASE_URL;
    delete process.env.AUTH0_ACTION_SHARED_SECRET;
    delete process.env.APP_PRODUCT_ID;
    delete process.env.VERCEL;
  });

  afterEach(() => {
    process.env = { ...backup };
  });

  it("reports incomplete env with typed reason codes", () => {
    const status = buildAuthRuntimeStatus({ databaseConnected: false });
    expect(status.ready).toBe(false);
    expect(status.reasonCodes).toContain("AUTH_ENV_INCOMPLETE");
  });

  it("is ready when Auth0 env is complete even if database is down", () => {
    process.env.AUTH0_ISSUER_BASE_URL = "https://tenant.auth0.com";
    process.env.AUTH0_CLIENT_ID = "client";
    process.env.AUTH0_CLIENT_SECRET = "secret";
    process.env.AUTH0_SECRET = "a".repeat(32);
    process.env.APP_BASE_URL = "https://cyware-docs-ctix.vercel.app";
    process.env.DATABASE_URL = "postgresql://user:pass@db.example/docs";
    process.env.AUTH0_ACTION_SHARED_SECRET = "b".repeat(32);

    const status = buildAuthRuntimeStatus({
      databaseConnected: false,
      databaseReasonCode: "connection_failed",
      clientConstructionSucceeded: true,
      currentRequestOrigin: "https://cyware-docs-ctix.vercel.app",
    });

    expect(status.ready).toBe(true);
    expect(status.reasonCodes).toContain("AUTH_DATABASE_UNAVAILABLE");
    expect(status.normalized.originMatches).toBe(true);
  });

  it("detects base URL mismatch", () => {
    process.env.AUTH0_ISSUER_BASE_URL = "https://tenant.auth0.com";
    process.env.AUTH0_CLIENT_ID = "client";
    process.env.AUTH0_CLIENT_SECRET = "secret";
    process.env.AUTH0_SECRET = "a".repeat(32);
    process.env.APP_BASE_URL = "https://cyware-docs-ctix.vercel.app";

    const status = buildAuthRuntimeStatus({
      clientConstructionSucceeded: true,
      currentRequestOrigin: "https://cyware-docs-csap.vercel.app",
    });

    expect(status.reasonCodes).toContain("AUTH_BASE_URL_MISMATCH");
  });
});

describe("normalizeDatabaseUrl", () => {
  const backup = process.env.VERCEL;

  afterEach(() => {
    if (backup === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = backup;
  });

  it("strips wrapping quotes and adds sslmode on Vercel", () => {
    process.env.VERCEL = "1";
    expect(normalizeDatabaseUrl('"postgresql://u:p@host/db"')).toBe(
      "postgresql://u:p@host/db?sslmode=require"
    );
  });

  it("does not duplicate sslmode", () => {
    process.env.VERCEL = "1";
    expect(normalizeDatabaseUrl("postgresql://u:p@host/db?sslmode=require")).toBe(
      "postgresql://u:p@host/db?sslmode=require"
    );
  });
});

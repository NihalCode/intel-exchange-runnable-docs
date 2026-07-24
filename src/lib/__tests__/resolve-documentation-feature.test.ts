import { describe, expect, it, afterEach } from "vitest";

import {
  getAuthEnv,
  isAuthEnvComplete,
  resolveAppBaseUrlForAuth,
} from "@/lib/documentation-auth/env";
import { isMultiProjectDeployment } from "@/lib/deployment/resolve-app-product-id";
import { resolveDocumentationFeatureEnabled } from "@/lib/documentation-features/resolve-enabled";

const ORIG = { ...process.env };

afterEach(() => {
  process.env = { ...ORIG };
});

describe("resolveAppBaseUrlForAuth", () => {
  it("falls back to VERCEL_URL when APP_BASE_URL is unset", () => {
    delete process.env.APP_BASE_URL;
    delete process.env.AUTH0_BASE_URL;
    process.env.VERCEL_URL = "cyware-docs-csap.vercel.app";
    expect(resolveAppBaseUrlForAuth()).toBe("https://cyware-docs-csap.vercel.app");
  });

  it("completes Auth0 env when only VERCEL_URL provides base URL", () => {
    process.env.AUTH0_ISSUER_BASE_URL = "https://tenant.auth0.com";
    process.env.AUTH0_CLIENT_ID = "client";
    process.env.AUTH0_CLIENT_SECRET = "secret";
    process.env.AUTH0_SECRET = "a".repeat(32);
    process.env.AUTH0_OKTA_CONNECTION = "test-okta-workforce";
    delete process.env.APP_BASE_URL;
    delete process.env.AUTH0_BASE_URL;
    process.env.VERCEL_URL = "cyware-docs-csap.vercel.app";
    expect(isAuthEnvComplete(getAuthEnv())).toBe(true);
  });
});

describe("isMultiProjectDeployment", () => {
  it("is true when VERCEL_TOKEN is set", () => {
    delete process.env.APP_PRODUCT_ID;
    process.env.VERCEL_TOKEN = "token";
    expect(isMultiProjectDeployment()).toBe(true);
  });
});

describe("resolveDocumentationFeatureEnabled (multi-project)", () => {
  it("enables deployments admin when VERCEL_TOKEN is set", async () => {
    delete process.env.APP_PRODUCT_ID;
    process.env.VERCEL_TOKEN = "token";
    await expect(
      resolveDocumentationFeatureEnabled({
        organizationId: "org-1",
        key: "admin_deployment_management",
      })
    ).resolves.toBe(true);
  });
});

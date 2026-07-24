import { afterEach, describe, expect, it } from "vitest";

import { canRunProductIngest } from "../developer/ingest-access";

const AUTH_ENV_KEYS = [
  "AUTH_DISABLED",
  "AUTH0_ISSUER_BASE_URL",
  "AUTH0_CLIENT_ID",
  "AUTH0_CLIENT_SECRET",
  "AUTH0_SECRET",
  "APP_BASE_URL",
  "AUTH0_OKTA_CONNECTION",
  "DEVELOPER_ACCESS_TOKEN",
  "DEV_CYWARE_CFTR_BASE_URL",
  "DEV_CYWARE_CFTR_ACCESS_ID",
  "DEV_CYWARE_CFTR_SECRET_KEY",
] as const;

describe("canRunProductIngest", () => {
  const saved: Record<string, string | undefined> = {};

  afterEach(() => {
    for (const key of AUTH_ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  function snapshotEnv() {
    for (const key of AUTH_ENV_KEYS) {
      saved[key] = process.env[key];
    }
  }

  function enableAuthEnv() {
    delete process.env.AUTH_DISABLED;
    process.env.AUTH0_ISSUER_BASE_URL = "https://tenant.auth0.com";
    process.env.AUTH0_CLIENT_ID = "client";
    process.env.AUTH0_CLIENT_SECRET = "secret";
    process.env.AUTH0_SECRET = "a".repeat(32);
    process.env.APP_BASE_URL = "https://app.example";
    process.env.AUTH0_OKTA_CONNECTION = "test-okta-workforce";
  }

  it("allows ingest for doc managers when Auth0 is enabled (no dev token)", () => {
    snapshotEnv();
    enableAuthEnv();
    delete process.env.DEVELOPER_ACCESS_TOKEN;
    delete process.env.DEV_CYWARE_CFTR_BASE_URL;

    const result = canRunProductIngest("cftr");
    expect(result.allowed).toBe(true);
    expect(result.blockers).toEqual([]);
  });

  it("requires developer token when auth is disabled", () => {
    snapshotEnv();
    process.env.AUTH_DISABLED = "true";
    delete process.env.DEVELOPER_ACCESS_TOKEN;

    const result = canRunProductIngest("cftr");
    expect(result.allowed).toBe(false);
    expect(result.blockers[0]).toMatch(/DEVELOPER_ACCESS_TOKEN/);
  });

  it("requires product credentials in legacy mode", () => {
    snapshotEnv();
    process.env.AUTH_DISABLED = "true";
    process.env.DEVELOPER_ACCESS_TOKEN = "tok";
    delete process.env.DEV_CYWARE_CFTR_BASE_URL;
    delete process.env.DEV_CYWARE_CFTR_ACCESS_ID;
    delete process.env.DEV_CYWARE_CFTR_SECRET_KEY;

    const result = canRunProductIngest("cftr");
    expect(result.allowed).toBe(false);
    expect(result.blockers.join(" ")).toMatch(/DEV_CYWARE_CFTR/);
  });
});

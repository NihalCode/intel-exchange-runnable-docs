import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getOktaGroupId,
  isOktaProvisioningConfigured,
  normalizeOktaOrgUrl,
  requireOktaProvisioningConfig,
} from "@/lib/okta/config";
import {
  isBlockedOktaProvisioningOutcome,
  provisionOktaUser,
} from "@/lib/okta/users";

const ENV_KEYS = [
  "OKTA_ORG_URL",
  "OKTA_API_TOKEN",
  "OKTA_APP_ID",
  "OKTA_DOCS_GROUP_ID",
  "OKTA_GROUP_ID",
  "OKTA_DOCS_GROUP_NAME",
  "OKTA_GROUP_NAME",
] as const;

function baseEnv(extra: Record<string, string> = {}) {
  process.env.OKTA_ORG_URL = "https://example.okta.com";
  process.env.OKTA_API_TOKEN = "ssws-test-token";
  process.env.OKTA_DOCS_GROUP_ID = "00gDocsUsers";
  Object.assign(process.env, extra);
}

describe("Okta config validation", () => {
  afterEach(() => {
    for (const key of ENV_KEYS) delete process.env[key];
  });

  it("rejects admin console org URLs", () => {
    expect(() => normalizeOktaOrgUrl("https://integrator-x-admin.okta.com")).toThrow(
      /admin/i
    );
  });

  it("requires HTTPS and strips trailing slash", () => {
    expect(normalizeOktaOrgUrl("https://example.okta.com/")).toBe(
      "https://example.okta.com"
    );
  });

  it("prefers OKTA_DOCS_GROUP_ID over OKTA_GROUP_ID and requires 00g prefix", () => {
    process.env.OKTA_DOCS_GROUP_ID = "00gPreferred";
    process.env.OKTA_GROUP_ID = "00gOther";
    expect(getOktaGroupId()).toBe("00gPreferred");
    process.env.OKTA_DOCS_GROUP_ID = "bad-id";
    expect(getOktaGroupId()).toBeUndefined();
  });

  it("isOktaProvisioningConfigured requires org+token+group", () => {
    expect(isOktaProvisioningConfigured()).toBe(false);
    baseEnv();
    expect(isOktaProvisioningConfigured()).toBe(true);
    expect(requireOktaProvisioningConfig().groupId).toBe("00gDocsUsers");
  });
});

describe("provisionOktaUser status workflows", () => {
  afterEach(() => {
    for (const key of ENV_KEYS) delete process.env[key];
    vi.unstubAllGlobals();
  });

  it("new user: create → group → activate with email", async () => {
    baseEnv();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? "GET").toUpperCase();
      if (url.endsWith("/users/alice%40example.com") && method === "GET") {
        return new Response(null, { status: 404 });
      }
      if (url.includes("/users?activate=false") && method === "POST") {
        return Response.json({
          id: "00uNew",
          status: "STAGED",
          profile: { email: "alice@example.com", login: "alice@example.com" },
        });
      }
      if (url.includes("/groups/00gDocsUsers/users/00uNew") && method === "PUT") {
        return new Response(null, { status: 204 });
      }
      if (url.endsWith("/users/00uNew/groups") && method === "GET") {
        return Response.json([{ id: "00gDocsUsers", profile: { name: "Cyware Docs Users" } }]);
      }
      if (
        url.includes("/users/00uNew/lifecycle/activate?sendEmail=true") &&
        method === "POST"
      ) {
        return new Response(null, { status: 200 });
      }
      return new Response(`unexpected ${method} ${url}`, { status: 500 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await provisionOktaUser({ email: "alice@example.com" });
    expect(result.outcome).toBe("new_user_activation_email_sent");
    expect(result.activationEmailSent).toBe(true);
    expect(result.groupAssigned).toBe(true);
    expect(result.created).toBe(true);
  });

  it("existing ACTIVE: group only, no activation email", async () => {
    baseEnv({ OKTA_APP_ID: "0oaTestApp" });
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? "GET").toUpperCase();
      if (url.endsWith("/users/bob%40example.com") && method === "GET") {
        return Response.json({
          id: "00uBob",
          status: "ACTIVE",
          profile: { email: "bob@example.com", login: "bob@example.com" },
        });
      }
      if (url.includes("/groups/00gDocsUsers/users/00uBob") && method === "PUT") {
        return new Response(null, { status: 204 });
      }
      if (url.endsWith("/users/00uBob/groups") && method === "GET") {
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
      if (url.includes("lifecycle")) {
        return new Response("must not activate ACTIVE", { status: 500 });
      }
      return new Response(`unexpected ${method} ${url}`, { status: 500 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await provisionOktaUser({ email: "bob@example.com" });
    expect(result.outcome).toBe("existing_active_access_granted");
    expect(result.activationEmailSent).toBe(false);
    expect(result.hint).toMatch(/Federation Broker Mode/i);
  });

  it("existing STAGED: group then activate", async () => {
    baseEnv();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? "GET").toUpperCase();
      if (url.endsWith("/users/carol%40example.com") && method === "GET") {
        return Response.json({
          id: "00uCarol",
          status: "STAGED",
          profile: { email: "carol@example.com", login: "carol@example.com" },
        });
      }
      if (url.includes("/groups/00gDocsUsers/users/00uCarol") && method === "PUT") {
        return new Response(null, { status: 204 });
      }
      if (url.endsWith("/users/00uCarol/groups") && method === "GET") {
        return Response.json([{ id: "00gDocsUsers" }]);
      }
      if (
        url.includes("/users/00uCarol/lifecycle/activate?sendEmail=true") &&
        method === "POST"
      ) {
        return new Response(null, { status: 200 });
      }
      return new Response(`unexpected ${method} ${url}`, { status: 500 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await provisionOktaUser({ email: "carol@example.com" });
    expect(result.outcome).toBe("existing_staged_activation_email_sent");
  });

  it("fails closed when group assignment fails (no activate)", async () => {
    baseEnv();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? "GET").toUpperCase();
      if (url.endsWith("/users/dave%40example.com") && method === "GET") {
        return new Response(null, { status: 404 });
      }
      if (url.includes("/users?activate=false") && method === "POST") {
        return Response.json({
          id: "00uDave",
          status: "STAGED",
          profile: { email: "dave@example.com", login: "dave@example.com" },
        });
      }
      if (url.includes("/groups/00gDocsUsers/users/00uDave") && method === "PUT") {
        return Response.json({ errorSummary: "group denied" }, { status: 403 });
      }
      return new Response(`unexpected ${method} ${url}`, { status: 500 });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(provisionOktaUser({ email: "dave@example.com" })).rejects.toMatchObject({
      code: "OKTA_GROUP_ASSIGNMENT_FAILED",
    });
    expect(
      fetchMock.mock.calls.some((c) => String(c[0]).includes("lifecycle/activate"))
    ).toBe(false);
  });

  it("LOCKED_OUT is a blocked outcome", async () => {
    baseEnv();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? "GET").toUpperCase();
      if (url.endsWith("/users/eve%40example.com") && method === "GET") {
        return Response.json({
          id: "00uEve",
          status: "LOCKED_OUT",
          profile: { email: "eve@example.com", login: "eve@example.com" },
        });
      }
      if (url.includes("/groups/00gDocsUsers/users/00uEve") && method === "PUT") {
        return new Response(null, { status: 204 });
      }
      if (url.endsWith("/users/00uEve/groups") && method === "GET") {
        return Response.json([{ id: "00gDocsUsers" }]);
      }
      return new Response(`unexpected ${method} ${url}`, { status: 500 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await provisionOktaUser({ email: "eve@example.com" });
    expect(result.outcome).toBe("existing_locked_out");
    expect(isBlockedOktaProvisioningOutcome(result.outcome)).toBe(true);
  });
});

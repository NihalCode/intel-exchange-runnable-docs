import { describe, expect, it, afterEach } from "vitest";
import {
  verifyDeveloperRequest,
  isDeveloperAccessConfigured,
} from "../developer/access";
import {
  isLiveApiUiEnabled,
  isPublicDocsMode,
  liveRunBlockedMessage,
} from "../public-docs-mode";
import { canRunDeveloperIngest, runDeveloperDiagnostics } from "../developer/diagnostics";

describe("developer access", () => {
  const orig = process.env.DEVELOPER_ACCESS_TOKEN;

  afterEach(() => {
    if (orig === undefined) delete process.env.DEVELOPER_ACCESS_TOKEN;
    else process.env.DEVELOPER_ACCESS_TOKEN = orig;
  });

  it("rejects requests without token", () => {
    process.env.DEVELOPER_ACCESS_TOKEN = "secret-dev-token";
    const req = new Request("http://localhost", { headers: {} });
    expect(verifyDeveloperRequest(req).ok).toBe(false);
  });

  it("accepts valid bearer token", () => {
    process.env.DEVELOPER_ACCESS_TOKEN = "secret-dev-token";
    const req = new Request("http://localhost", {
      headers: { Authorization: "Bearer secret-dev-token" },
    });
    expect(verifyDeveloperRequest(req).ok).toBe(true);
  });

  it("reports unconfigured developer access", () => {
    delete process.env.DEVELOPER_ACCESS_TOKEN;
    expect(isDeveloperAccessConfigured()).toBe(false);
  });
});

describe("public docs mode", () => {
  const orig = process.env.NEXT_PUBLIC_ENABLE_LIVE_API_UI;

  afterEach(() => {
    if (orig === undefined) delete process.env.NEXT_PUBLIC_ENABLE_LIVE_API_UI;
    else process.env.NEXT_PUBLIC_ENABLE_LIVE_API_UI = orig;
  });

  it("defaults to public docs mode when live UI unset", () => {
    delete process.env.NEXT_PUBLIC_ENABLE_LIVE_API_UI;
    expect(isPublicDocsMode()).toBe(true);
    expect(isLiveApiUiEnabled()).toBe(false);
  });

  it("enables live UI when env is true", () => {
    process.env.NEXT_PUBLIC_ENABLE_LIVE_API_UI = "true";
    expect(isLiveApiUiEnabled()).toBe(true);
  });

  it("live run message mentions developer credentials", () => {
    expect(liveRunBlockedMessage()).toMatch(/developer/i);
  });
});

describe("developer ingest blockers", () => {
  const origToken = process.env.DEVELOPER_ACCESS_TOKEN;
  const origBase = process.env.DEV_CYWARE_CFTR_BASE_URL;

  afterEach(() => {
    if (origToken === undefined) delete process.env.DEVELOPER_ACCESS_TOKEN;
    else process.env.DEVELOPER_ACCESS_TOKEN = origToken;
    if (origBase === undefined) delete process.env.DEV_CYWARE_CFTR_BASE_URL;
    else process.env.DEV_CYWARE_CFTR_BASE_URL = origBase;
  });

  it("blocks ingest without developer token", () => {
    delete process.env.DEVELOPER_ACCESS_TOKEN;
    const r = canRunDeveloperIngest("cftr");
    expect(r.allowed).toBe(false);
    expect(r.blockers[0]).toMatch(/DEVELOPER_ACCESS_TOKEN/);
  });

  it("blocks ingest without product credentials", () => {
    process.env.DEVELOPER_ACCESS_TOKEN = "tok";
    delete process.env.DEV_CYWARE_CFTR_BASE_URL;
    delete process.env.DEV_CYWARE_CFTR_ACCESS_ID;
    delete process.env.DEV_CYWARE_CFTR_SECRET_KEY;
    const r = canRunDeveloperIngest("cftr");
    expect(r.allowed).toBe(false);
    expect(r.blockers.join(" ")).toMatch(/DEV_CYWARE_CFTR/);
  });

  it("diagnostics do not block public documentation", () => {
    delete process.env.DEVELOPER_ACCESS_TOKEN;
    const d = runDeveloperDiagnostics();
    expect(d.publicDocsMode).toBe(true);
    const blocking = d.blockers.filter((b) => b.blocking);
    expect(blocking.every((b) => b.id !== "public-docs-mode")).toBe(true);
  });

  it("diagnostics include openai status without key value", () => {
    delete process.env.OPENAI_API_KEY;
    const d = runDeveloperDiagnostics();
    expect(d.openai.configured).toBe(false);
    expect(d.openai.visibleToClient).toBe(false);
    expect(d.openai.developerStatusLabel).toBe("Missing");
    expect(JSON.stringify(d.openai)).not.toMatch(/sk-[a-zA-Z0-9]{10,}/);
  });
});

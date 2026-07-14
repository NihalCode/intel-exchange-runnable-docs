import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  createEmptySession,
  createSession,
  getSession,
  listSessions,
  loadWorkspaceStore,
  upsertSession,
  titleFromFirstMessage,
} from "../agent/workspace-client";
import { resolveAgentIntent, isExplainQuery } from "../agent/intent";
import { resolveAgentRun } from "../agent/mode";
import { appendSimpleExplanation } from "../agent/explain-simple";
import type { AgentResponse } from "../agent/types";

describe("workspace-client", () => {
  let storage: Record<string, string>;

  beforeEach(() => {
    storage = {};
    const ls = {
      getItem(key: string) {
        return storage[key] ?? null;
      },
      setItem(key: string, value: string) {
        storage[key] = value;
      },
      removeItem(key: string) {
        delete storage[key];
      },
    };
    vi.stubGlobal("localStorage", ls);
    vi.stubGlobal("window", { localStorage: ls });
    loadWorkspaceStore();
  });

  it("creating a new chat does not delete old chats", () => {
    const store = loadWorkspaceStore();
    store.sessions = [];
    localStorage.setItem("cyware-agent-workspace-v1", JSON.stringify(store));

    const first = createEmptySession();
    first.title = "Dashboard chat";
    upsertSession(first);
    const second = createSession();
    second.title = "Snippet chat";
    upsertSession(second);

    const sessions = listSessions();
    expect(sessions.length).toBeGreaterThanOrEqual(2);
    expect(sessions.some((s) => s.title === "Dashboard chat")).toBe(true);
    expect(sessions.some((s) => s.title === "Snippet chat")).toBe(true);
  });

  it("returning to an old chat restores messages and files context", () => {
    const session = createEmptySession();
    session.messages = [
      { id: "u1", role: "user", content: "Build a dashboard" },
      {
        id: "a1",
        role: "assistant",
        content: "Here is your app",
        response: {
          mode: "app",
          workflow: "App ready",
          confidence: 1,
          fallback: false,
          citations: [],
          steps: [],
          app: {
            title: "Dashboard",
            description: "Test",
            architecture: "",
            setupInstructions: "",
            envExample: "",
            files: [{ path: "app/page.tsx", code: "export default function Page() {}", language: "typescript", description: "page" }],
          },
        },
      },
    ];
    session.activeAppId = "app-123";
    upsertSession(session);

    const restored = getSession(session.id);
    expect(restored?.messages).toHaveLength(2);
    expect(restored?.activeAppId).toBe("app-123");
    expect(
      (restored?.messages[1] as { response?: { app?: { files?: unknown[] } } }).response?.app?.files
    ).toHaveLength(1);
  });

  it("titles chats from the first user message", () => {
    expect(titleFromFirstMessage("Build me a threat intel dashboard")).toContain("Build me");
  });
});

describe("resolveAgentIntent — unified workspace", () => {
  const savedFiles = { files: [{ path: "app/page.tsx", code: "x" }] };

  it("routes app build without mode tabs", () => {
    const r = resolveAgentIntent("Build a dashboard for CFTR incidents", { hasProjectFiles: false });
    expect(r.intent).toBe("app_build");
    expect(r.mode).toBe("app");
  });

  it("edits existing project when user asks for changes", () => {
    const r = resolveAgentIntent("Add a filter for severity", { hasProjectFiles: true });
    expect(r.intent).toBe("app_edit");
    expect(r.editExistingApp).toBe(true);
  });

  it("edits a specifically named project file", () => {
    const r = resolveAgentIntent("Change app/page.tsx to add a status filter", {
      hasProjectFiles: true,
    });
    expect(r.intent).toBe("app_edit");
  });

  it("keeps API troubleshooting in workflow mode despite a loaded project", () => {
    const r = resolveAgentIntent("I get a 404 exporting indicators after the upgrade. Fix this.", {
      hasProjectFiles: true,
    });
    expect(r.intent).toBe("workflow");
    expect(r.editExistingApp).toBe(false);
  });

  it("keeps CTIX documentation questions out of app routing", () => {
    const r = resolveAgentIntent("What does CTIX indicator export do?", {
      hasProjectFiles: true,
    });
    expect(r.intent).not.toBe("app_edit");
    expect(r.intent).not.toBe("app_build");
  });

  it("does not treat a product use case alone as an app build", () => {
    expect(resolveAgentIntent("phishing", { hasProjectFiles: false }).intent).not.toBe("app_build");
  });

  it("still plans workflow for doc questions without edit signals", () => {
    const r = resolveAgentIntent("List threat data indicators with pagination", {
      hasProjectFiles: true,
    });
    expect(r.intent).toBe("workflow");
    expect(r.editExistingApp).toBe(false);
  });

  it("detects explain simply requests", () => {
    expect(isExplainQuery("Explain this code like I am not a developer")).toBe(true);
    expect(resolveAgentIntent("Explain simply how ping works", { hasProjectFiles: false }).intent).toBe(
      "explain"
    );
  });

  it("detects snippet requests", () => {
    expect(resolveAgentIntent("Show me the curl snippet for CSAP alerts", { hasProjectFiles: false }).intent).toBe(
      "snippet"
    );
  });

  it("resolveAgentRun edits when files exist and query is an edit", () => {
    const { mode, editExistingApp } = resolveAgentRun({
      query: "Add export to CSV",
      existingApp: savedFiles,
    });
    expect(mode).toBe("app");
    expect(editExistingApp).toBe(true);
  });
});

describe("appendSimpleExplanation", () => {
  it("adds plain-language section for workflow responses", () => {
    const response: AgentResponse = {
      mode: "workflow",
      workflow: "[CTIX] List indicators",
      confidence: 0.9,
      fallback: false,
      citations: [{ slug: "x", title: "List", url: "/docs/x" }],
      steps: [
        {
          order: 1,
          slug: "x",
          title: "List",
          method: "GET",
          path: "/",
          explanation: "",
          docUrl: "",
          warnings: [],
          params: {},
          code: "curl ...",
          request: { method: "GET", path: "/", query: [], headers: [] },
          meta: {},
          spec: {} as AgentResponse["steps"][0]["spec"],
        },
      ],
    };
    const text = appendSimpleExplanation(response, "explain simply");
    expect(text).toContain("In simple terms");
    expect(text).toContain("<BASE_URL>");
  });
});

describe("snippet placeholders", () => {
  it("codegen patterns use credential placeholders not real secrets", async () => {
    const { generateStepCode } = await import("../agent/codegen");
    const page = {
      slug: "ping/ping",
      title: "Ping",
      kind: "endpoint" as const,
      breadcrumb: [],
      description: "",
      method: "GET" as const,
      path: "/ping/",
      request: {},
      responses: [],
    };
    const { code } = generateStepCode(page, {}, "python", "https://example.com/ctixapi", "ctix");
    expect(code).not.toMatch(/sk-[a-zA-Z0-9]{20,}/);
    expect(code).toMatch(/AccessID|ACCESS|BASE|placeholder|<|YOUR/i);
  });
});

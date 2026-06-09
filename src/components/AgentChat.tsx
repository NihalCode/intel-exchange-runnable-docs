"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AgentMessageView } from "./AgentMessageView";
import {
  AgentSavedAppsBar,
  ImportVercelModal,
  blueprintFromVersion,
  getLatestVersion,
  getSavedApp,
} from "./AgentSavedAppsBar";
import type { AgentLanguage, AgentMode, AgentResponse, ExistingAppContext } from "@/lib/agent/types";
import {
  loadActiveAppId,
  saveAppVersion,
  setActiveAppId,
} from "@/lib/agent/saved-apps-client";
import { slugifyProjectName } from "@/lib/agent/app-diff";

const WORKFLOW_EXAMPLES = [
  "Import a STIX 2.1 bundle and verify the indicator appears in threat data",
  "List threat data indicators with pagination",
  "Test API connectivity with ping",
];

const APP_EXAMPLES = [
  "Build a phishing email analyzer website that extracts IOCs and checks them in Cyware",
  "Build a STIX import portal with a dashboard",
];

const LANGUAGES: { value: AgentLanguage; label: string }[] = [
  { value: "python", label: "Python" },
  { value: "javascript", label: "JavaScript" },
  { value: "curl", label: "cURL" },
  { value: "java", label: "Java" },
  { value: "go", label: "Go" },
];

type UserMessage = { id: string; role: "user"; content: string };
type AssistantMessage = { id: string; role: "assistant"; content: string; response: AgentResponse };
type ErrorMessage = { id: string; role: "error"; content: string };
type ChatMessage = UserMessage | AssistantMessage | ErrorMessage;

function uid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function historyForApi(messages: ChatMessage[]): { role: "user" | "assistant"; content: string }[] {
  return messages
    .filter((m): m is UserMessage | AssistantMessage => m.role === "user" || m.role === "assistant")
    .slice(-10)
    .map((m) => ({ role: m.role, content: m.content }));
}

function existingAppContext(activeAppId: string | null): ExistingAppContext | undefined {
  if (!activeAppId) return undefined;
  const app = getSavedApp(activeAppId);
  const version = app ? getLatestVersion(app) : undefined;
  if (!app || !version) return undefined;
  return {
    appId: app.id,
    title: app.title,
    version: version.version,
    vercelProjectName: app.vercelProjectName,
    deploymentUrl: app.deploymentUrl,
    files: version.files,
  };
}

export function AgentChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<AgentMode>("workflow");
  const [language, setLanguage] = useState<AgentLanguage>("python");
  const [llmKey, setLlmKey] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [activeAppId, setActiveAppIdState] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const examples = mode === "app" ? APP_EXAMPLES : WORKFLOW_EXAMPLES;
  const isEmpty = messages.length === 0;
  const activeApp = activeAppId ? getSavedApp(activeAppId) : undefined;

  useEffect(() => {
    setActiveAppIdState(loadActiveAppId());
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const handleSelectApp = useCallback((appId: string | null) => {
    setActiveAppIdState(appId);
    setMode("app");
  }, []);

  const persistAppResponse = useCallback(
    (data: AgentResponse, deploy?: { deploymentUrl: string; deploymentId: string; projectName: string }) => {
      if (data.mode !== "app" || !data.app) return;
      const saved = saveAppVersion({
        appId: data.app.appId ?? activeAppId ?? undefined,
        title: data.app.title,
        summary: data.workflow,
        files: data.app.files,
        deploymentUrl: deploy?.deploymentUrl ?? data.app.deploymentUrl,
        deploymentId: deploy?.deploymentId,
        vercelProjectName: deploy?.projectName ?? data.app.vercelProjectName,
      });
      setActiveAppIdState(saved.id);
      if (data.app) {
        data.app.appId = saved.id;
        data.app.version = saved.versions[saved.versions.length - 1]?.version;
        data.app.vercelProjectName = saved.vercelProjectName;
        data.app.deploymentUrl = saved.deploymentUrl;
      }
    },
    [activeAppId]
  );

  function newChat() {
    setMessages([]);
    setInput("");
    inputRef.current?.focus();
  }

  async function send(text?: string) {
    const q = (text ?? input).trim();
    if (!q || loading) return;

    const userMsg: UserMessage = { id: uid(), role: "user", content: q };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    const existingApp =
      mode === "app" ? existingAppContext(activeAppId) : undefined;

    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: q,
          mode,
          language,
          llmApiKey: llmKey.trim() || undefined,
          history: historyForApi([...messages, userMsg].slice(0, -1)),
          existingApp,
        }),
      });
      const data = (await res.json()) as AgentResponse & { error?: string };
      if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);

      persistAppResponse(data);

      const assistantMsg: AssistantMessage = {
        id: uid(),
        role: "assistant",
        content: data.workflow,
        response: data,
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      const errMsg: ErrorMessage = {
        id: uid(),
        role: "error",
        content: err instanceof Error ? err.message : "Something went wrong",
      };
      setMessages((prev) => [...prev, errMsg]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  }

  function handleDeploySuccess(info: {
    deploymentUrl: string;
    deploymentId: string;
    projectName: string;
  }) {
    if (!activeAppId) return;
    const app = getSavedApp(activeAppId);
    const version = app ? getLatestVersion(app) : undefined;
    if (!app || !version) return;
    saveAppVersion({
      appId: app.id,
      title: app.title,
      summary: version.summary,
      files: version.files.map((f) => ({
        path: f.path,
        code: f.code,
        language: f.language ?? "typescript",
        description: f.description ?? f.path,
      })),
      deploymentUrl: info.deploymentUrl,
      deploymentId: info.deploymentId,
      vercelProjectName: info.projectName,
    });
  }

  function loadSavedAppIntoChat(appId: string) {
    const app = getSavedApp(appId);
    const version = app ? getLatestVersion(app) : undefined;
    if (!app || !version) return;
    setActiveAppIdState(appId);
    setMode("app");
    const blueprint = blueprintFromVersion(app, version);
    const response: AgentResponse = {
      mode: "app",
      workflow: `Loaded **${app.title}** v${version.version} from saved projects. Describe changes to edit in place, then redeploy to the same Vercel project (\`${app.vercelProjectName}\`).`,
      confidence: 1,
      fallback: false,
      citations: [],
      steps: [],
      app: blueprint,
    };
    setMessages([
      {
        id: uid(),
        role: "assistant",
        content: response.workflow,
        response,
      },
    ]);
  }

  return (
    <div className="flex h-[calc(100vh-12rem)] min-h-[520px] flex-col rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      {showImport && (
        <ImportVercelModal
          onClose={() => setShowImport(false)}
          onImported={(id) => {
            loadSavedAppIntoChat(id);
          }}
        />
      )}

      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setMode("workflow")}
            className={`rounded-lg px-3 py-1 text-xs font-semibold transition ${
              mode === "workflow"
                ? "bg-sky-600 text-white"
                : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900"
            }`}
          >
            Run workflow
          </button>
          <button
            type="button"
            onClick={() => setMode("app")}
            className={`rounded-lg px-3 py-1 text-xs font-semibold transition ${
              mode === "app"
                ? "bg-indigo-600 text-white"
                : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900"
            }`}
          >
            Build app
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowSettings((s) => !s)}
            className="rounded-lg px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900"
          >
            {showSettings ? "Hide settings" : "Settings"}
          </button>
          {!isEmpty && (
            <button
              type="button"
              onClick={newChat}
              className="rounded-lg border border-zinc-300 px-2.5 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400"
            >
              New chat
            </button>
          )}
        </div>
      </div>

      {mode === "app" && (
        <AgentSavedAppsBar
          activeAppId={activeAppId}
          onSelectApp={(id) => {
            if (id) loadSavedAppIntoChat(id);
            else {
              setActiveAppIdState(null);
              setActiveAppId(null);
            }
          }}
          onImportClick={() => setShowImport(true)}
        />
      )}

      {mode === "app" && activeApp && (
        <div className="shrink-0 border-b border-indigo-200/60 bg-indigo-50/40 px-4 py-1.5 text-[11px] text-indigo-900 dark:border-indigo-900 dark:bg-indigo-950/30 dark:text-indigo-200">
          Editing <strong>{activeApp.title}</strong> v{activeApp.versions.length}
          {activeApp.deploymentUrl ? (
            <>
              {" · redeploy updates "}
              <code className="font-mono">{activeApp.vercelProjectName || slugifyProjectName(activeApp.title)}</code>
              {" in place"}
            </>
          ) : null}
        </div>
      )}

      {showSettings ? (
        <div className="shrink-0 border-b border-zinc-200 bg-zinc-50/80 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900/50">
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs">
              <span className="font-semibold text-zinc-600 dark:text-zinc-400">Snippet language</span>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value as AgentLanguage)}
                className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 dark:border-zinc-700 dark:bg-zinc-950"
              >
                {LANGUAGES.map((l) => (
                  <option key={l.value} value={l.value}>
                    {l.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-w-[220px] flex-1 flex-col gap-1 text-xs">
              <span className="font-semibold text-zinc-600 dark:text-zinc-400">OpenAI API key (optional)</span>
              <input
                type="password"
                value={llmKey}
                onChange={(e) => setLlmKey(e.target.value)}
                placeholder="Uses server key if configured"
                autoComplete="off"
                className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 font-mono text-xs dark:border-zinc-700 dark:bg-zinc-950"
              />
            </label>
          </div>
        </div>
      ) : null}

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {isEmpty ? (
          <div className="mx-auto flex h-full max-w-lg flex-col items-center justify-center text-center">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-100 text-2xl dark:bg-sky-950">
              ⚡
            </div>
            <h2 className="text-lg font-semibold">Cyware Documentation Agent</h2>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              {mode === "app"
                ? "Build or import an app. Saved projects persist across new chats — edit in place and redeploy to the same Vercel URL."
                : "Ask about any Cyware API workflow. Follow up to refine steps or parameters."}
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {examples.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  onClick={() => void send(ex)}
                  className="rounded-full border border-zinc-200 px-3 py-1 text-[11px] text-zinc-600 transition hover:border-sky-300 hover:bg-sky-50 dark:border-zinc-700 dark:text-zinc-400"
                >
                  {ex.length > 48 ? `${ex.slice(0, 48)}…` : ex}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-3xl space-y-5">
            {messages.map((msg) => {
              if (msg.role === "user") {
                return (
                  <div key={msg.id} className="flex justify-end">
                    <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-sky-600 px-4 py-2.5 text-sm text-white">
                      {msg.content}
                    </div>
                  </div>
                );
              }
              if (msg.role === "error") {
                return (
                  <div key={msg.id} className="flex justify-start">
                    <div className="max-w-[90%] rounded-2xl rounded-bl-sm border border-red-300 bg-red-50 px-4 py-2.5 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
                      {msg.content}
                    </div>
                  </div>
                );
              }
              return (
                <div key={msg.id} className="flex justify-start">
                  <div className="w-full max-w-full space-y-3 rounded-2xl rounded-bl-sm border border-zinc-200 bg-zinc-50/80 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900/60">
                    <div className="flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-sky-100 text-xs dark:bg-sky-950">
                        AI
                      </span>
                      <span className="text-xs font-semibold text-zinc-500">
                        {msg.response.appEdit
                          ? "App editor"
                          : msg.response.mode === "app"
                            ? "App builder"
                            : "Workflow planner"}
                        {msg.response.confidence > 0
                          ? ` · ${Math.round(msg.response.confidence * 100)}% match`
                          : ""}
                      </span>
                    </div>
                    <div className="prose prose-sm max-w-none whitespace-pre-wrap dark:prose-invert">
                      {msg.content}
                    </div>
                    <AgentMessageView
                      response={msg.response}
                      language={language}
                      onDeploySuccess={handleDeploySuccess}
                    />
                  </div>
                </div>
              );
            })}

            {loading ? (
              <div className="flex justify-start">
                <div className="flex items-center gap-2 rounded-2xl rounded-bl-sm border border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900/60">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-sky-100 text-xs dark:bg-sky-950">
                    AI
                  </span>
                  <span className="text-sm text-zinc-500">
                    {activeAppId && mode === "app" ? "Editing app…" : "Searching docs…"}
                  </span>
                </div>
              </div>
            ) : null}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-zinc-200 p-3 dark:border-zinc-800">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
          className="mx-auto flex max-w-3xl items-end gap-2"
        >
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            placeholder={
              mode === "app"
                ? activeAppId
                  ? "Describe changes to your saved app…"
                  : "Describe an app to build…"
                : "Ask a question or refine the workflow…"
            }
            disabled={loading}
            className="max-h-32 min-h-[42px] flex-1 resize-none rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-sky-500 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="inline-flex h-[42px] shrink-0 items-center justify-center rounded-xl bg-sky-600 px-4 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:opacity-40"
          >
            Send
          </button>
        </form>
        <p className="mx-auto mt-1.5 max-w-3xl text-center text-[10px] text-zinc-400">
          Apps saved in this browser · New chat keeps your project · Redeploy uses the same Vercel project name
        </p>
      </div>
    </div>
  );
}

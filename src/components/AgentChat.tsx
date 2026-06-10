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
import {
  AGENT_UPLOAD_ACCEPT,
  attachmentFromFile,
  buildQueryWithAttachments,
  type AgentAttachment,
} from "@/lib/agent/file-extract-client";

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

function existingAppContext(
  activeAppId: string | null,
  messages: ChatMessage[]
): ExistingAppContext | undefined {
  if (activeAppId) {
    const app = getSavedApp(activeAppId);
    const version = app ? getLatestVersion(app) : undefined;
    if (app && version) {
      return {
        appId: app.id,
        title: app.title,
        version: version.version,
        vercelProjectName: app.vercelProjectName,
        deploymentUrl: app.deploymentUrl,
        files: version.files,
      };
    }
  }

  // Fall back to the most recent app blueprint in this chat (same session edits)
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== "assistant" || !m.response.app?.files?.length) continue;
    const app = m.response.app;
    return {
      appId: app.appId,
      title: app.title,
      version: app.version ?? 1,
      vercelProjectName: app.vercelProjectName,
      deploymentUrl: app.deploymentUrl,
      files: app.files.map((f) => ({
        path: f.path,
        code: f.code,
        language: f.language,
        description: f.description,
      })),
    };
  }

  return undefined;
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
  const [attachments, setAttachments] = useState<AgentAttachment[]>([]);
  const [extracting, setExtracting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    setAttachments([]);
    inputRef.current?.focus();
  }

  async function addFiles(list: FileList | File[] | null) {
    if (!list || loading) return;
    const files = Array.from(list);
    if (files.length === 0) return;
    setExtracting(true);
    const errors: string[] = [];
    for (const file of files) {
      try {
        const att = await attachmentFromFile(file);
        setAttachments((prev) => [...prev, att]);
      } catch (e) {
        errors.push(e instanceof Error ? e.message : `${file.name}: failed to read`);
      }
    }
    if (errors.length > 0) {
      setMessages((prev) => [
        ...prev,
        { id: uid(), role: "error", content: errors.join(" · ") },
      ]);
    }
    setExtracting(false);
    inputRef.current?.focus();
  }

  async function send(text?: string) {
    const typed = (text ?? input).trim();
    const pendingAttachments = text === undefined ? attachments : [];
    if ((!typed && pendingAttachments.length === 0) || loading || extracting) return;

    const q = buildQueryWithAttachments(
      typed || "Analyze the attached file(s).",
      pendingAttachments
    );
    const displayContent =
      pendingAttachments.length > 0
        ? `${typed || "Analyze the attached file(s)."}\n📎 ${pendingAttachments.map((a) => a.name).join(", ")}`
        : typed;

    const userMsg: UserMessage = { id: uid(), role: "user", content: displayContent };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setAttachments([]);
    setLoading(true);

    const priorMessages = [...messages, userMsg].slice(0, -1);
    const existingApp = existingAppContext(activeAppId, priorMessages);
    const effectiveMode = existingApp ? "app" : mode;

    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: q,
          mode: effectiveMode,
          language,
          llmApiKey: llmKey.trim() || undefined,
          history: historyForApi(priorMessages),
          existingApp,
        }),
      });
      const bodyText = await res.text();
      let data: AgentResponse & { error?: string | { message?: string; code?: string } };
      try {
        data = JSON.parse(bodyText);
      } catch {
        // Vercel timeout/crash pages are plain text, not JSON
        throw new Error(
          res.ok
            ? "The server returned an unreadable response. Try again."
            : `Server error (${res.status}): ${bodyText.slice(0, 200) || res.statusText}. ` +
              "If this is a timeout, try a shorter or more specific edit request."
        );
      }
      if (!res.ok) {
        // Vercel infrastructure errors return { error: { message, code } } (an object, not a string).
        const raw = data.error;
        const msg =
          typeof raw === "string"
            ? raw
            : typeof raw === "object" && raw !== null
              ? (raw.message ?? raw.code ?? JSON.stringify(raw))
              : `Request failed (${res.status})`;
        throw new Error(msg);
      }

      persistAppResponse(data);

      if (data.mode === "app" && data.app) {
        setMode("app");
      }

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
                    <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-sky-600 px-4 py-2.5 text-sm text-white">
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

      <div
        className={`shrink-0 border-t p-3 transition ${
          dragOver
            ? "border-sky-400 bg-sky-50/60 dark:border-sky-700 dark:bg-sky-950/30"
            : "border-zinc-200 dark:border-zinc-800"
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          void addFiles(e.dataTransfer.files);
        }}
      >
        {(attachments.length > 0 || extracting) && (
          <div className="mx-auto mb-2 flex max-w-3xl flex-wrap items-center gap-1.5">
            {attachments.map((a, i) => (
              <span
                key={`${a.name}-${i}`}
                className="inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[11px] text-sky-800 dark:border-sky-900 dark:bg-sky-950/50 dark:text-sky-300"
              >
                📎 {a.name}
                {a.truncated ? " (truncated)" : ""}
                <button
                  type="button"
                  aria-label={`Remove ${a.name}`}
                  onClick={() => setAttachments((prev) => prev.filter((_, idx) => idx !== i))}
                  className="text-sky-500 hover:text-sky-700 dark:hover:text-sky-200"
                >
                  ×
                </button>
              </span>
            ))}
            {extracting && (
              <span className="text-[11px] text-zinc-500">Extracting text from files…</span>
            )}
          </div>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
          className="mx-auto flex max-w-3xl items-end gap-2"
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={AGENT_UPLOAD_ACCEPT}
            className="hidden"
            onChange={(e) => {
              void addFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={loading || extracting}
            title="Attach files — .eml, .txt, .csv, .xml, STIX 2.x (.json/.stix), PDF, Word (.docx), images (OCR)"
            aria-label="Attach files"
            className="inline-flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-xl border border-zinc-300 text-lg text-zinc-500 transition hover:border-sky-400 hover:text-sky-600 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-400"
          >
            📎
          </button>
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
                : "Ask a question or refine the workflow… (drop files anywhere here)"
            }
            disabled={loading}
            className="max-h-32 min-h-[42px] flex-1 resize-none rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-sky-500 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950"
          />
          <button
            type="submit"
            disabled={loading || extracting || (!input.trim() && attachments.length === 0)}
            className="inline-flex h-[42px] shrink-0 items-center justify-center rounded-xl bg-sky-600 px-4 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:opacity-40"
          >
            Send
          </button>
        </form>
        <p className="mx-auto mt-1.5 max-w-3xl text-center text-[10px] text-zinc-400">
          Attach .eml, STIX, PDF, Word, images & more · Apps saved in this browser · Redeploy uses the same Vercel project name
        </p>
      </div>
    </div>
  );
}

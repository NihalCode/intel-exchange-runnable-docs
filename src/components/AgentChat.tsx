"use client";

import { useEffect, useRef, useState } from "react";
import { AgentMessageView } from "./AgentMessageView";
import type { AgentLanguage, AgentMode, AgentResponse } from "@/lib/agent/types";

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
    .map((m) => ({
      role: m.role,
      content: m.role === "assistant" ? m.content : m.content,
    }));
}

export function AgentChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<AgentMode>("workflow");
  const [language, setLanguage] = useState<AgentLanguage>("python");
  const [llmKey, setLlmKey] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const examples = mode === "app" ? APP_EXAMPLES : WORKFLOW_EXAMPLES;
  const isEmpty = messages.length === 0;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

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
        }),
      });
      const data = (await res.json()) as AgentResponse & { error?: string };
      if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);

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

  return (
    <div className="flex h-[calc(100vh-12rem)] min-h-[520px] flex-col rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      {/* Header */}
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

      {/* Settings panel */}
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
              <span className="font-semibold text-zinc-600 dark:text-zinc-400">
                OpenAI API key (optional)
              </span>
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

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {isEmpty ? (
          <div className="mx-auto flex h-full max-w-lg flex-col items-center justify-center text-center">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-100 text-2xl dark:bg-sky-950">
              ⚡
            </div>
            <h2 className="text-lg font-semibold">Cyware Documentation Agent</h2>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              {mode === "app"
                ? "Describe an app to build. Follow up to refine — add features, change endpoints, redeploy."
                : "Ask about any Cyware API workflow. Follow up to refine steps, change parameters, or ask questions."}
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {examples.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  onClick={() => void send(ex)}
                  className="rounded-full border border-zinc-200 px-3 py-1 text-[11px] text-zinc-600 transition hover:border-sky-300 hover:bg-sky-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-sky-800 dark:hover:bg-sky-950/30"
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
                        {msg.response.mode === "app" ? "App builder" : "Workflow planner"}
                        {msg.response.confidence > 0
                          ? ` · ${Math.round(msg.response.confidence * 100)}% match`
                          : ""}
                      </span>
                    </div>
                    <div className="prose prose-sm max-w-none whitespace-pre-wrap dark:prose-invert">
                      {msg.content}
                    </div>
                    <AgentMessageView response={msg.response} language={language} />
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
                  <span className="flex items-center gap-1.5 text-sm text-zinc-500">
                    <span className="inline-flex gap-0.5">
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400 [animation-delay:0ms]" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400 [animation-delay:150ms]" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400 [animation-delay:300ms]" />
                    </span>
                    Searching docs…
                  </span>
                </div>
              </div>
            ) : null}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Input */}
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
                ? "Describe or refine your app…"
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
          Enter to send · Shift+Enter for new line · Conversation context is kept for follow-ups
        </p>
      </div>
    </div>
  );
}

"use client";

import { useEffect } from "react";
import { AgentMessageView } from "./AgentMessageView";
import { AgentSavedAppsBar, ImportVercelModal } from "./AgentSavedAppsBar";
import { AgentChatSidebar } from "./AgentChatSidebar";
import { AgentProjectPanel } from "./AgentProjectPanel";
import { AgentDeployModal } from "./AgentAppBlueprintView";
import { useAgentChat } from "./agent-chat-state";
import { AGENT_UPLOAD_ACCEPT } from "@/lib/agent/file-extract-client";

const QUICK_STARTS = [
  "Build me a dashboard that shows threat intel alerts",
  "Fetch the API snippet for creating an Orchestrate workflow",
  "Explain this code like I am not a developer",
  "Create an app that searches CTIX indicators",
  "Turn this API into a simple form",
  "Build a workflow launcher for CSAP",
  "Debug my generated app — make errors easier to understand",
];

const LANGUAGES: { value: import("@/lib/agent/types").AgentLanguage; label: string }[] = [
  { value: "python", label: "Python" },
  { value: "javascript", label: "JavaScript" },
  { value: "curl", label: "cURL" },
  { value: "java", label: "Java" },
  { value: "go", label: "Go" },
];

export function AgentChat() {
  const chat = useAgentChat();
  const {
    messages,
    input,
    setInput,
    language,
    setLanguage,
    showSettings,
    setShowSettings,
    showImport,
    setShowImport,
    loading,
    intentLabel,
    attachments,
    extracting,
    dragOver,
    setDragOver,
    bottomRef,
    inputRef,
    fileInputRef,
    sessions,
    activeSessionId,
    selectedFilePath,
    setSelectedFilePath,
    panelLogs,
    projectApp,
    deploying,
    committing,
    newChat,
    switchSession,
    renameChat,
    deleteChat,
    addFiles,
    send,
    handleDeploySuccess,
    loadSavedAppIntoChat,
    handleSelectApp,
    clearActiveApp,
    removeAttachment,
    triggerDeploy,
    triggerCommit,
    triggerPreview,
    downloadProjectZip,
    showDeployModal,
    setShowDeployModal,
  } = chat;

  const isEmpty = messages.length === 0;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading, bottomRef]);

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  }

  return (
    <div className="flex h-[calc(100vh-8rem)] min-h-[560px] overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <AgentChatSidebar
        sessions={sessions}
        activeSessionId={activeSessionId}
        onSelect={switchSession}
        onNew={newChat}
        onRename={renameChat}
        onDelete={deleteChat}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        {showImport && (
          <ImportVercelModal
            onClose={() => setShowImport(false)}
            onImported={(id) => loadSavedAppIntoChat(id)}
          />
        )}
        {showDeployModal && projectApp ? (
          <AgentDeployModal
            app={projectApp}
            onClose={() => setShowDeployModal(false)}
            onDeploySuccess={handleDeploySuccess}
          />
        ) : null}

        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-zinc-200 px-4 py-2.5 dark:border-zinc-800">
          <div>
            <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Cyware AI Agent</h2>
            <p className="text-[11px] text-zinc-500">
              Tell me what you want — I&apos;ll find docs, write code, build apps, and explain in plain English.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowSettings((s) => !s)}
              className="rounded-lg px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900"
            >
              {showSettings ? "Hide settings" : "Settings"}
            </button>
          </div>
        </div>

        <AgentSavedAppsBar
          activeAppId={chat.activeAppId}
          onSelectApp={(id) => {
            if (id) loadSavedAppIntoChat(id);
            else clearActiveApp();
          }}
          onImportClick={() => setShowImport(true)}
        />

        {showSettings ? (
          <div className="shrink-0 border-b border-zinc-200 bg-zinc-50/80 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900/50">
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1 text-xs">
                <span className="font-semibold text-zinc-600 dark:text-zinc-400">Example code language</span>
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value as typeof language)}
                  className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 dark:border-zinc-700 dark:bg-zinc-950"
                >
                  {LANGUAGES.map((l) => (
                    <option key={l.value} value={l.value}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
        ) : null}

        <div className="flex-1 overflow-y-auto px-4 py-4">
          {isEmpty ? (
            <div className="mx-auto flex h-full max-w-lg flex-col items-center justify-center text-center">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-100 text-2xl dark:bg-sky-950">
                ✨
              </div>
              <h2 className="text-lg font-semibold">What would you like to do?</h2>
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                Ask in everyday language — no need to know APIs, Git, or deployment tools.
              </p>
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                {QUICK_STARTS.map((ex) => (
                  <button
                    key={ex}
                    type="button"
                    onClick={() => void send(ex)}
                    className="rounded-full border border-zinc-200 px-3 py-1 text-[11px] text-zinc-600 transition hover:border-sky-300 hover:bg-sky-50 dark:border-zinc-700 dark:text-zinc-400"
                  >
                    {ex.length > 52 ? `${ex.slice(0, 52)}…` : ex}
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
                            ? "Updated your app"
                            : msg.response.mode === "app"
                              ? "Built for you"
                              : "Answer"}
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
                        workflowId={msg.id}
                        onDeploySuccess={handleDeploySuccess}
                        compactAppFiles
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
                    <span className="text-sm text-zinc-500">{intentLabel ?? "Working on it…"}</span>
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
                    onClick={() => removeAttachment(i)}
                    className="text-sky-500 hover:text-sky-700 dark:hover:text-sky-200"
                  >
                    ×
                  </button>
                </span>
              ))}
              {extracting && (
                <span className="text-[11px] text-zinc-500">Reading attached files…</span>
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
              title="Attach files"
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
              placeholder="Describe what you want — build an app, fetch a snippet, explain an API…"
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
        </div>
      </div>

      <AgentProjectPanel
        app={projectApp}
        selectedPath={selectedFilePath}
        onSelectPath={setSelectedFilePath}
        logs={panelLogs}
        onPreview={triggerPreview}
        onDeploy={triggerDeploy}
        onCommit={triggerCommit}
        onDownloadZip={() => void downloadProjectZip()}
        deploying={deploying}
        committing={committing}
      />
    </div>
  );
}

"use client";

import { useEffect, useMemo } from "react";
import { AgentFeedbackControl } from "./AgentFeedbackControl";
import { AgentMessageView } from "./AgentMessageView";
import { AgentSavedAppsBar, ImportVercelModal } from "./AgentSavedAppsBar";
import { AgentChatSidebar } from "./AgentChatSidebar";
import { AgentProjectPanel } from "./AgentProjectPanel";
import { AgentDeployModal } from "./AgentAppBlueprintView";
import {
  AgentProductAccessProvider,
  quickStartsForProducts,
} from "./AgentProductAccess";
import { useAgentChat } from "./agent-chat-state";
import { Markdown } from "./Markdown";
import { AGENT_UPLOAD_ACCEPT } from "@/lib/agent/file-extract-client";
import { degradedRetrievalNotice, evidenceLabel, progressLabel } from "@/lib/agent/answer-ux";
import { getProduct, inferProductsFromQuery } from "@/lib/products/registry";

const QUICK_STARTS = [
  "How do I authenticate a CTIX API request?",
  "Show a Python example for creating an Orchestrate workflow",
  "Which endpoint searches CTIX indicators?",
  "Compare the connectivity endpoints across products",
  "Explain the required parameters for creating a CSAP alert",
];

const LANGUAGES: { value: import("@/lib/agent/types").AgentLanguage; label: string }[] = [
  { value: "python", label: "Python" },
  { value: "javascript", label: "JavaScript" },
  { value: "curl", label: "cURL" },
  { value: "java", label: "Java" },
  { value: "go", label: "Go" },
];

export function AgentChat({
  credentialedProducts,
  features = {},
}: {
  credentialedProducts: readonly string[];
  features?: Partial<Record<
    | "app_builder"
    | "project_workspace"
    | "preview"
    | "vercel_deployment"
    | "git_commit"
    | "project_download"
    | "vercel_import"
    | "chat_feedback",
    boolean
  >>;
}) {
  const quickStarts = useMemo(
    () => quickStartsForProducts(QUICK_STARTS, credentialedProducts, inferProductsFromQuery),
    [credentialedProducts]
  );
  const connectedLabels = useMemo(
    () =>
      credentialedProducts
        .map((id) => getProduct(id)?.displayLabel ?? id)
        .join(", "),
    [credentialedProducts]
  );

  return (
    <AgentProductAccessProvider credentialedProducts={credentialedProducts}>
      <AgentChatBody
        quickStarts={quickStarts}
        connectedLabels={connectedLabels}
        features={features}
      />
    </AgentProductAccessProvider>
  );
}

function AgentChatBody({
  quickStarts,
  connectedLabels,
  features = {},
}: {
  quickStarts: string[];
  connectedLabels: string;
  features?: Partial<Record<
    | "app_builder"
    | "project_workspace"
    | "preview"
    | "vercel_deployment"
    | "git_commit"
    | "project_download"
    | "vercel_import"
    | "chat_feedback",
    boolean
  >>;
}) {
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
    statusMessage,
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
    cancel,
    handleDeploySuccess,
    loadSavedAppIntoChat,
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
    bottomRef.current?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
  }, [messages, loading, bottomRef]);

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  }

  return (
    <section
      aria-labelledby="agent-chat-heading"
      className="flex h-[calc(100vh-8rem)] min-h-[560px] overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
    >
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {loading
          ? progressLabel(intentLabel)
          : extracting
            ? "Reading attached files"
            : statusMessage ?? ""}
      </div>
      <AgentChatSidebar
        sessions={sessions}
        activeSessionId={activeSessionId}
        onSelect={switchSession}
        onNew={newChat}
        onRename={renameChat}
        onDelete={deleteChat}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        {features.vercel_import && showImport && (
          <ImportVercelModal
            onClose={() => setShowImport(false)}
            onImported={(id) => loadSavedAppIntoChat(id)}
          />
        )}
        {features.vercel_deployment && showDeployModal && projectApp ? (
          <AgentDeployModal
            app={projectApp}
            onClose={() => setShowDeployModal(false)}
            onDeploySuccess={handleDeploySuccess}
          />
        ) : null}

        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-zinc-200 px-4 py-2.5 dark:border-zinc-800">
          <div>
            <h2 id="agent-chat-heading" className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Documentation Agent</h2>
            <p className="text-[11px] text-zinc-500">
              Ask about endpoints, authentication, workflows, parameters, and code examples.
            </p>
            <p className="text-[11px] text-sky-700 dark:text-sky-300">
              Connected products: {connectedLabels}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowSettings((s) => !s)}
              aria-expanded={showSettings}
              aria-controls="agent-chat-settings"
              className="rounded-lg px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900"
            >
              {showSettings ? "Hide settings" : "Settings"}
            </button>
          </div>
        </div>

        {features.project_workspace ? (
          <AgentSavedAppsBar
            activeAppId={chat.activeAppId}
            onSelectApp={(id) => {
              if (id) loadSavedAppIntoChat(id);
              else clearActiveApp();
            }}
            onImportClick={() => features.vercel_import && setShowImport(true)}
          />
        ) : null}

        {showSettings ? (
          <div id="agent-chat-settings" className="shrink-0 border-b border-zinc-200 bg-zinc-50/80 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900/50">
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

        <div aria-label="Conversation" className="flex-1 overflow-y-auto px-4 py-4">
          {isEmpty ? (
            <div className="mx-auto flex h-full max-w-lg flex-col items-center justify-center text-center">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-100 text-2xl dark:bg-sky-950">
                ✨
              </div>
              <h2 className="text-lg font-semibold">What would you like to learn?</h2>
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                Ask in everyday language. Answers are grounded in the published product documentation.
              </p>
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                {quickStarts.map((ex) => (
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
                      <div role="alert" className="max-w-[90%] rounded-2xl rounded-bl-sm border border-red-300 bg-red-50 px-4 py-2.5 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
                        {msg.content}
                      </div>
                    </div>
                  );
                }
                const evidence = evidenceLabel(msg.response.retrievalEvidence);
                const retrievalNotice = degradedRetrievalNotice(msg.response.retrievalDegraded);
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
                        </span>
                        {evidence ? (
                          <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-medium text-sky-800 dark:bg-sky-950 dark:text-sky-200">
                            {evidence}
                          </span>
                        ) : null}
                        {msg.response.productContext?.label ? (
                          <span className="text-[10px] text-zinc-400">{msg.response.productContext.label}</span>
                        ) : null}
                      </div>
                      {retrievalNotice ? (
                        <p className="rounded-lg border border-sky-200 bg-sky-50/70 px-3 py-2 text-xs text-sky-900 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-200">
                          {retrievalNotice}
                        </p>
                      ) : null}
                      {msg.content.length > 900 || msg.response.steps.length > 2 ? (
                        <nav
                          aria-label="Jump to sections"
                          className="flex flex-wrap gap-2 text-[11px] text-zinc-500"
                        >
                          <a href={`#answer-${msg.id}`} className="underline-offset-2 hover:underline">
                            Answer
                          </a>
                          {msg.response.steps.length ? (
                            <a href={`#steps-${msg.id}`} className="underline-offset-2 hover:underline">
                              API details
                            </a>
                          ) : null}
                          {msg.response.citations.length ? (
                            <a href={`#sources-${msg.id}`} className="underline-offset-2 hover:underline">
                              Sources
                            </a>
                          ) : null}
                        </nav>
                      ) : null}
                      <div id={`answer-${msg.id}`} className="prose prose-sm max-w-none dark:prose-invert">
                        <Markdown>{msg.content}</Markdown>
                      </div>
                      <div id={`steps-${msg.id}`}>
                      <AgentMessageView
                        response={msg.response}
                        language={language}
                        workflowId={msg.id}
                        onDeploySuccess={handleDeploySuccess}
                        compactAppFiles
                      />
                      </div>
                      <AgentFeedbackControl
                        messageId={msg.id}
                        conversationId={msg.conversationId}
                        turnId={msg.turnId}
                        logicalQueryId={msg.logicalQueryId}
                        productId={msg.response.productContext?.products[0]?.id}
                        enabled={Boolean(features.chat_feedback)}
                      />
                    </div>
                  </div>
                );
              })}

              {loading ? (
                <div className="flex justify-start">
                  <div
                    aria-live="polite"
                    className="flex items-center gap-2 rounded-2xl rounded-bl-sm border border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900/60"
                  >
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-sky-100 text-xs dark:bg-sky-950">
                      AI
                    </span>
                    <span className="text-sm text-zinc-500">{progressLabel(intentLabel)}</span>
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
              aria-label="Ask the documentation agent"
              placeholder="Ask about an endpoint, workflow, parameter, or code example…"
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
            {loading ? (
              <button
                type="button"
                onClick={cancel}
                className="inline-flex h-[42px] shrink-0 items-center justify-center rounded-xl border border-red-300 px-4 text-sm font-semibold text-red-700 transition hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950/30"
              >
                Stop
              </button>
            ) : null}
          </form>
          {statusMessage ? (
            <p role="status" className="mx-auto mt-2 max-w-3xl text-xs text-zinc-500 dark:text-zinc-400">
              {statusMessage}
            </p>
          ) : null}
        </div>
      </div>

      {features.project_workspace ? (
        <AgentProjectPanel
          app={projectApp}
          selectedPath={selectedFilePath}
          onSelectPath={setSelectedFilePath}
          logs={panelLogs}
          onPreview={features.preview ? triggerPreview : undefined}
          onDeploy={features.vercel_deployment ? triggerDeploy : undefined}
          onCommit={features.git_commit ? triggerCommit : undefined}
          onDownloadZip={features.project_download ? () => void downloadProjectZip() : undefined}
          deploying={deploying}
          committing={committing}
        />
      ) : null}
    </section>
  );
}

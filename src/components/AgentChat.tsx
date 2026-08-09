"use client";

import { useEffect, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import {
  Paperclip,
  Settings2,
  Sparkles,
  Send,
  Square,
  X,
} from "lucide-react";
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
import { SignalTopologyArt } from "./fabric/SignalField";
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
  docsPreviewMode = false,
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
  /** Local AUTH_DISABLED: docs answers work without stored credentials. */
  docsPreviewMode?: boolean;
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
        docsPreviewMode={docsPreviewMode}
        features={features}
      />
    </AgentProductAccessProvider>
  );
}

function AgentChatBody({
  quickStarts,
  connectedLabels,
  docsPreviewMode = false,
  features = {},
}: {
  quickStarts: string[];
  connectedLabels: string;
  docsPreviewMode?: boolean;
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
  const searchParams = useSearchParams();
  const focusBuild = searchParams.get("focus") === "build";
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

  useEffect(() => {
    if (!focusBuild || !features.project_workspace) return;
    const panel = document.querySelector('[data-layout="cx-build-app-panel"]');
    panel?.scrollIntoView({
      block: "nearest",
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
  }, [focusBuild, features.project_workspace]);

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  }

  const workstationClass = features.project_workspace
    ? "atlas-workstation"
    : "atlas-workstation atlas-workstation--dual";

  return (
    <section
      aria-labelledby="agent-chat-heading"
      className={workstationClass}
      data-testid="agent-chat"
      data-layout="cx-ask-workspace"
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

      <div className="atlas-panel" data-layout="cx-ask-stage">
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

        <div className="atlas-panel__header">
          <div className="min-w-0">
            <p className="atlas-micro-label" style={{ color: "var(--accent-ai)" }}>
              Conversation
            </p>
            <h2 id="agent-chat-heading" className="mt-0.5 text-sm font-semibold text-[var(--text-heading)]">
              Ask AI
            </h2>
            <p className="text-[11px] text-[var(--text-secondary)]">
              Ask about endpoints, authentication, workflows, parameters, and code examples.
            </p>
            <p className="text-[11px] text-[var(--text-link)]">
              {docsPreviewMode
                ? "Documentation search covers all products in this preview. Connect credentials at Authentication to run live API calls."
                : `Connected products: ${connectedLabels}`}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowSettings((s) => !s)}
            aria-expanded={showSettings}
            aria-controls="agent-chat-settings"
            className="atlas-icon-btn"
            title={showSettings ? "Hide settings" : "Settings"}
          >
            <Settings2 className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="sr-only">{showSettings ? "Hide settings" : "Settings"}</span>
          </button>
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
          <div
            id="agent-chat-settings"
            className="shrink-0 border-b border-[var(--border-subtle)] bg-[var(--surface-sunken)] px-4 py-3"
          >
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1 text-xs">
                <span className="atlas-micro-label">Example code language</span>
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value as typeof language)}
                  className="rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--surface-raised)] px-2 py-1.5 text-[var(--text-primary)]"
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

        <div
          aria-label="Conversation"
          data-top-chrome-scroll
          className="atlas-panel__body scroll-thin overflow-y-auto px-4 py-4"
        >
          {isEmpty ? (
            <div className="cx-ask-empty">
              <SignalTopologyArt
                variant="ops"
                className="pointer-events-none absolute inset-x-0 top-1/2 h-44 w-full -translate-y-[70%] opacity-30"
              />
              <div
                className="relative mb-4 flex h-14 w-14 items-center justify-center rounded-[var(--radius-lg)] border border-[color-mix(in_srgb,var(--accent-ai)_35%,var(--border-subtle))] bg-[var(--accent-ai-soft)] text-[var(--accent-ai)]"
                aria-hidden="true"
              >
                <Sparkles className="h-6 w-6" />
              </div>
              <h2 className="relative text-xl font-semibold tracking-tight text-[var(--text-heading)]">
                Start a conversation
              </h2>
              <p className="relative mt-1.5 max-w-md text-sm text-[var(--text-secondary)]">
                Ask in everyday language. Answers are grounded in published Cyware product documentation —
                endpoints, auth, workflows, and runnable examples.
              </p>
              <div className="relative mt-6 flex flex-wrap justify-center gap-2">
                {quickStarts.map((ex) => (
                  <button
                    key={ex}
                    type="button"
                    onClick={() => void send(ex)}
                    className="cx-ask-chip"
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
                    <div key={msg.id} className="cx-ask-msg-enter flex justify-end">
                      <div className="cx-ask-user-bubble">{msg.content}</div>
                    </div>
                  );
                }
                if (msg.role === "error") {
                  return (
                    <div key={msg.id} className="cx-ask-msg-enter flex justify-start">
                      <div
                        role="alert"
                        className="max-w-[90%] rounded-[var(--radius-xl)] border border-[var(--border-default)] bg-[var(--danger-soft)] px-4 py-2.5 text-sm text-[var(--danger)]"
                      >
                        {msg.content}
                      </div>
                    </div>
                  );
                }
                const evidence = evidenceLabel(msg.response.retrievalEvidence);
                const retrievalNotice = degradedRetrievalNotice(msg.response.retrievalDegraded);
                return (
                  <div key={msg.id} className="cx-ask-msg-enter flex justify-start">
                    <div className="cx-ask-intel-panel space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="flex h-6 w-6 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--accent-ai-soft)] text-[var(--accent-ai)]">
                          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                        </span>
                        <span className="text-xs font-semibold text-[var(--text-secondary)]">
                          {msg.response.appEdit
                            ? "Updated your app"
                            : msg.response.mode === "app"
                              ? "Built for you"
                              : "Answer"}
                        </span>
                        {evidence ? (
                          <span className="rounded-[var(--radius-sm)] border border-[color-mix(in_srgb,var(--accent-ai)_30%,var(--border-subtle))] bg-[var(--accent-ai-soft)] px-2 py-0.5 font-mono text-[10px] font-medium tracking-wide text-[var(--accent-ai)]">
                            {evidence}
                          </span>
                        ) : null}
                        {msg.response.productContext?.label ? (
                          <span className="text-[10px] text-[var(--text-muted)]">
                            {msg.response.productContext.label}
                          </span>
                        ) : null}
                      </div>
                      {retrievalNotice ? (
                        <p className="rounded-[var(--radius-md)] border border-[color-mix(in_srgb,var(--accent-ai)_25%,var(--border-default))] bg-[var(--accent-ai-soft)] px-3 py-2 text-xs text-[var(--text-primary)]">
                          {retrievalNotice}
                        </p>
                      ) : null}
                      {msg.content.length > 900 || msg.response.steps.length > 2 ? (
                        <nav
                          aria-label="Jump to sections"
                          className="flex flex-wrap gap-2 text-[11px] text-[var(--text-muted)]"
                        >
                          <a href={`#answer-${msg.id}`} className="underline-offset-2 hover:underline hover:text-[var(--text-link)]">
                            Answer
                          </a>
                          {msg.response.steps.length ? (
                            <a href={`#steps-${msg.id}`} className="underline-offset-2 hover:underline hover:text-[var(--text-link)]">
                              API details
                            </a>
                          ) : null}
                          {msg.response.citations.length ? (
                            <a href={`#sources-${msg.id}`} className="underline-offset-2 hover:underline hover:text-[var(--text-link)]">
                              Sources
                            </a>
                          ) : null}
                        </nav>
                      ) : null}
                      <div id={`answer-${msg.id}`} className="prose prose-sm prose-cyware max-w-none dark:prose-invert">
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
                        logicalQueryId={msg.logicalQueryId ?? msg.id}
                        productId={msg.response.productContext?.products[0]?.id}
                        queryText={msg.queryText}
                        // Show unless an admin explicitly disabled chat_feedback.
                        // Anonymous Ask AI often has an empty features map.
                        enabled={features.chat_feedback !== false}
                      />
                    </div>
                  </div>
                );
              })}

              {loading ? (
                <div className="cx-ask-msg-enter flex justify-start">
                  <div aria-live="polite" className="cx-ask-status-pill">
                    <span className="flex h-6 w-6 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--accent-ai-soft)] text-[var(--accent-ai)]">
                      <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                    </span>
                    <span
                      className="h-1.5 w-1.5 rounded-full bg-[var(--accent-ai)] sf-signal-pulse"
                      aria-hidden="true"
                    />
                    <span className="text-sm text-[var(--text-secondary)]">
                      {progressLabel(intentLabel)}
                    </span>
                  </div>
                </div>
              ) : null}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        <div
          className="atlas-transmission"
          data-drag={dragOver ? "true" : "false"}
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
          <div className="atlas-transmission__meta mx-auto max-w-3xl">
            <span className="atlas-micro-label">Message</span>
            <span className="atlas-micro-label">
              {extracting
                ? "Reading files…"
                : loading
                  ? "Generating response…"
                  : "Ready to send"}
            </span>
          </div>
          {(attachments.length > 0 || extracting) && (
            <div className="mx-auto mb-2 flex max-w-3xl flex-wrap items-center gap-1.5">
              {attachments.map((a, i) => (
                <span
                  key={`${a.name}-${i}`}
                  className="inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-[color-mix(in_srgb,var(--accent-ai)_30%,var(--border-default))] bg-[var(--accent-ai-soft)] px-2.5 py-1 font-mono text-[11px] text-[var(--text-primary)]"
                >
                  <Paperclip className="h-3 w-3 text-[var(--accent-ai)]" aria-hidden="true" />
                  {a.name}
                  {a.truncated ? " (truncated)" : ""}
                  <button
                    type="button"
                    aria-label={`Remove ${a.name}`}
                    onClick={() => removeAttachment(i)}
                    className="text-[var(--text-muted)] hover:text-[var(--text-heading)]"
                  >
                    <X className="h-3 w-3" aria-hidden="true" />
                  </button>
                </span>
              ))}
              {extracting && (
                <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-[var(--text-muted)]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent-ai)] sf-signal-pulse" aria-hidden="true" />
                  Reading attached files…
                </span>
              )}
            </div>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
            className="atlas-transmission__shell"
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
              className="atlas-btn-ghost atlas-btn-sm inline-flex h-10 min-w-10 items-center justify-center gap-1 px-2"
            >
              <Paperclip className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">Attach</span>
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
              className="atlas-transmission__input"
            />
            <button
              type="submit"
              disabled={loading || extracting || (!input.trim() && attachments.length === 0)}
              className="atlas-transmission__send"
            >
              <Send className="h-3.5 w-3.5" aria-hidden="true" />
              Send
            </button>
            {loading ? (
              <button
                type="button"
                onClick={cancel}
                className="inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-[var(--radius-sm)] border border-[color-mix(in_srgb,var(--danger)_40%,var(--border-default))] px-3 font-mono text-[11px] font-semibold uppercase tracking-wide text-[var(--danger)] transition hover:bg-[var(--danger-soft)]"
              >
                <Square className="h-3 w-3" aria-hidden="true" />
                Stop
              </button>
            ) : null}
          </form>
          {statusMessage ? (
            <p role="status" className="mx-auto mt-2 max-w-3xl font-mono text-[11px] text-[var(--text-muted)]">
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

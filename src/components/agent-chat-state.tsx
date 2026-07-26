"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { resolveAgentIntent } from "@/lib/agent/intent";
import { inferProductsFromQuery } from "@/lib/products/registry";
import { clampAgentProductId, useAgentProductAccess } from "@/components/AgentProductAccess";
import { useDocumentationAuth } from "@/components/auth/DocumentationAuthProvider";
import { useProduct } from "./ProductContext";
import { blueprintFromVersion, getLatestVersion, getSavedApp } from "./AgentSavedAppsBar";
import type { AgentLanguage, AgentResponse, ExistingAppContext } from "@/lib/agent/types";
import {
  loadActiveAppId,
  saveAppVersion,
  setActiveAppId,
} from "@/lib/agent/saved-apps-client";
import {
  attachmentFromFile,
  buildQueryWithAttachments,
  type AgentAttachment,
} from "@/lib/agent/file-extract-client";
import { createAgentRequestId } from "@/lib/agent/events";
import { withCsrfHeaders, clearCsrfTokenCache } from "@/lib/csrf-client";
import { classifyAgentHttpFailure } from "@/lib/user-facing-errors";
import {
  appendSessionLog,
  createSession as createWorkspaceSession,
  deleteSession,
  getSession,
  listSessions,
  loadWorkspaceStore,
  renameSession,
  setActiveSession,
  titleFromFirstMessage,
  upsertSession,
  type AgentWorkspaceSession,
  type StoredChatMessage,
} from "@/lib/agent/workspace-client";
import type { AgentAppBlueprint } from "@/lib/agent/types";

export type UserMessage = { id: string; role: "user"; content: string };
export type AssistantMessage = {
  id: string;
  role: "assistant";
  content: string;
  response: AgentResponse;
  conversationId?: string | null;
  turnId?: string | null;
  logicalQueryId?: string | null;
  /** User question that produced this answer (for feedback → unanswered capture). */
  queryText?: string | null;
};
export type ErrorMessage = { id: string; role: "error"; content: string };
export type ChatMessage = UserMessage | AssistantMessage | ErrorMessage;

type ServerConversationResponse = {
  conversation?: { id?: unknown };
};

type ServerTurnResponse = {
  turn?: { id?: unknown };
};

function uid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function toStored(messages: ChatMessage[]): StoredChatMessage[] {
  return messages.map((m) => {
    if (m.role === "assistant") {
      return { id: m.id, role: "assistant", content: m.content, response: m.response };
    }
    return m;
  });
}

function fromStored(messages: StoredChatMessage[]): ChatMessage[] {
  return messages.map((m) => {
    if (m.role === "assistant") {
      return {
        id: m.id,
        role: "assistant",
        content: m.content,
        response: m.response as AgentResponse,
      };
    }
    return m;
  });
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

function latestBlueprint(
  activeAppId: string | null,
  messages: ChatMessage[]
): AgentAppBlueprint | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role === "assistant" && m.response.app?.files?.length) {
      return m.response.app;
    }
  }
  if (activeAppId) {
    const app = getSavedApp(activeAppId);
    const version = app ? getLatestVersion(app) : undefined;
    if (app && version) return blueprintFromVersion(app, version);
  }
  return undefined;
}

function persistSession(
  sessionId: string,
  patch: Partial<AgentWorkspaceSession> & { messages?: ChatMessage[] }
): void {
  const store = loadWorkspaceStore();
  const existing = store.sessions.find((s) => s.id === sessionId);
  if (!existing) return;
  upsertSession({
    ...existing,
    ...patch,
    messages: patch.messages ? toStored(patch.messages) : existing.messages,
  });
}

export type AgentChatState = {
  messages: ChatMessage[];
  input: string;
  setInput: (value: string) => void;
  language: AgentLanguage;
  setLanguage: (language: AgentLanguage) => void;
  showSettings: boolean;
  setShowSettings: React.Dispatch<React.SetStateAction<boolean>>;
  showImport: boolean;
  setShowImport: (show: boolean) => void;
  activeAppId: string | null;
  loading: boolean;
  intentLabel: string | null;
  statusMessage: string | null;
  attachments: AgentAttachment[];
  extracting: boolean;
  dragOver: boolean;
  setDragOver: (over: boolean) => void;
  bottomRef: React.RefObject<HTMLDivElement | null>;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  sessions: AgentWorkspaceSession[];
  activeSessionId: string | null;
  selectedFilePath: string | null;
  setSelectedFilePath: (path: string | null) => void;
  panelLogs: string[];
  projectApp: AgentAppBlueprint | undefined;
  deploying: boolean;
  committing: boolean;
  newChat: () => void;
  switchSession: (id: string) => void;
  renameChat: (id: string, title: string) => void;
  deleteChat: (id: string) => void;
  addFiles: (list: FileList | File[] | null) => Promise<void>;
  send: (text?: string) => Promise<void>;
  cancel: () => void;
  handleDeploySuccess: (info: {
    deploymentUrl: string;
    deploymentId: string;
    projectName: string;
  }) => void;
  loadSavedAppIntoChat: (appId: string) => void;
  handleSelectApp: (appId: string | null) => void;
  clearActiveApp: () => void;
  removeAttachment: (index: number) => void;
  triggerDeploy: () => void;
  triggerCommit: () => void;
  triggerPreview: () => void;
  downloadProjectZip: () => Promise<void>;
  showDeployModal: boolean;
  setShowDeployModal: (show: boolean) => void;
};

const AgentChatContext = createContext<AgentChatState | null>(null);

export function AgentChatProvider({ children }: { children: ReactNode }) {
  const { productId, searchScope } = useProduct();
  const { state: authState } = useDocumentationAuth();
  const credentialedProducts = useAgentProductAccess();
  const [sessions, setSessions] = useState<AgentWorkspaceSession[]>([]);
  const [activeSessionId, setActiveSessionIdState] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [language, setLanguage] = useState<AgentLanguage>("python");
  const [showSettings, setShowSettings] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showDeployModal, setShowDeployModal] = useState(false);
  const [activeAppId, setActiveAppIdState] = useState<string | null>(null);
  const [selectedFilePath, setSelectedFilePathState] = useState<string | null>(null);
  const [panelLogs, setPanelLogs] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [intentLabel, setIntentLabel] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [deploying] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [attachments, setAttachments] = useState<AgentAttachment[]>([]);
  const [extracting, setExtracting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sessionIdRef = useRef<string | null>(null);
  const requestControllerRef = useRef<AbortController | null>(null);
  const activeServerTurnRef = useRef<{ conversationId: string; turnId: string } | null>(null);

  useEffect(() => {
    return () => requestControllerRef.current?.abort();
  }, []);

  const loadSessionIntoState = useCallback((session: AgentWorkspaceSession) => {
    sessionIdRef.current = session.id;
    setActiveSessionIdState(session.id);
    setMessages(fromStored(session.messages));
    setLanguage(session.language);
    setActiveAppIdState(session.activeAppId ?? loadActiveAppId());
    setSelectedFilePathState(session.selectedFilePath ?? null);
    setPanelLogs(session.panelLogs);
    setInput("");
    setAttachments([]);
  }, []);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      const store = loadWorkspaceStore();
      setSessions(store.sessions);
      const session = store.sessions.find((s) => s.id === store.activeSessionId) ?? store.sessions[0];
      if (session) loadSessionIntoState(session);
    });
    return () => {
      active = false;
    };
  }, [loadSessionIntoState]);

  const projectApp = useMemo(
    () => latestBlueprint(activeAppId, messages),
    [activeAppId, messages]
  );

  const refreshSessions = useCallback(() => {
    setSessions(listSessions());
  }, []);

  const ensureServerConversation = useCallback(
    async (sessionId: string): Promise<string | null> => {
      const session = getSession(sessionId);
      if (!session) return null;

      try {
        if (session.serverConversationId) {
          const existing = await fetch(`/api/agent/conversations/${session.serverConversationId}`);
          if (existing.ok) return session.serverConversationId;
        }

        const response = await fetch("/api/agent/conversations", {
          method: "POST",
          headers: await withCsrfHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ title: session.title }),
        });
        if (!response.ok) return null;
        const data = (await response.json()) as ServerConversationResponse;
        const id = data.conversation?.id;
        if (typeof id !== "string" || !id) return null;

        persistSession(sessionId, { serverConversationId: id });
        refreshSessions();
        return id;
      } catch {
        // Server persistence is best-effort; the local workspace remains usable offline.
        return null;
      }
    },
    [refreshSessions]
  );

  const startServerTurn = useCallback(
    async (
      conversationId: string,
      sessionId: string,
      messageId: string,
      userText: string,
      requestId: string
    ): Promise<string | null> => {
      try {
        const idempotencyKey = `${sessionId}:${messageId}`;
        const response = await fetch(`/api/agent/conversations/${conversationId}/turns`, {
          method: "POST",
          headers: await withCsrfHeaders({
            "Content-Type": "application/json",
            "Idempotency-Key": idempotencyKey,
            "X-Request-Id": requestId,
          }),
          body: JSON.stringify({ userText, idempotencyKey }),
        });
        if (!response.ok) return null;
        const data = (await response.json()) as ServerTurnResponse;
        const turnId = data.turn?.id;
        if (typeof turnId === "string" && turnId) {
          persistSession(sessionId, { serverTurnId: turnId });
          refreshSessions();
          return turnId;
        }
        return null;
      } catch {
        // A failed audit write must never prevent the agent response.
        return null;
      }
    },
    [refreshSessions]
  );

  const logPanel = useCallback((line: string) => {
    const sid = sessionIdRef.current;
    if (!sid) return;
    appendSessionLog(sid, line);
    setPanelLogs((prev) => [...prev.slice(-199), `[${new Date().toLocaleTimeString()}] ${line}`]);
  }, []);

  const handleSelectApp = useCallback(
    (appId: string | null) => {
      setActiveAppIdState(appId);
      if (sessionIdRef.current) {
        persistSession(sessionIdRef.current, { activeAppId: appId });
        refreshSessions();
      }
    },
    [refreshSessions]
  );

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
      if (sessionIdRef.current) {
        persistSession(sessionIdRef.current, { activeAppId: saved.id });
        refreshSessions();
      }
    },
    [activeAppId, refreshSessions]
  );

  const newChat = useCallback(() => {
    const session = createWorkspaceSession();
    loadSessionIntoState(session);
    refreshSessions();
    inputRef.current?.focus();
  }, [loadSessionIntoState, refreshSessions]);

  const switchSession = useCallback(
    (id: string) => {
      const session = setActiveSession(id);
      if (session) {
        loadSessionIntoState(session);
        refreshSessions();
      }
    },
    [loadSessionIntoState, refreshSessions]
  );

  const renameChat = useCallback(
    (id: string, title: string) => {
      renameSession(id, title);
      refreshSessions();
    },
    [refreshSessions]
  );

  const deleteChat = useCallback(
    (id: string) => {
      deleteSession(id);
      const store = loadWorkspaceStore();
      setSessions(store.sessions);
      const active = store.sessions.find((s) => s.id === store.activeSessionId);
      if (active) loadSessionIntoState(active);
    },
    [loadSessionIntoState]
  );

  const setSelectedFilePath = useCallback((path: string | null) => {
    setSelectedFilePathState(path);
    if (sessionIdRef.current) {
      persistSession(sessionIdRef.current, { selectedFilePath: path });
    }
  }, []);

  useEffect(() => {
    if (!sessionIdRef.current) return;
    persistSession(sessionIdRef.current, { messages, language, panelLogs });
    refreshSessions();
  }, [messages, language, panelLogs, refreshSessions]);

  const addFiles = useCallback(
    async (list: FileList | File[] | null) => {
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
        setMessages((prev) => [...prev, { id: uid(), role: "error", content: errors.join(" · ") }]);
      }
      setExtracting(false);
      inputRef.current?.focus();
    },
    [loading]
  );

  const send = useCallback(
    async (text?: string) => {
      const typed = (text ?? input).trim();
      const pendingAttachments = text === undefined ? attachments : [];
      if ((!typed && pendingAttachments.length === 0) || loading || extracting) return;

      const q = buildQueryWithAttachments(typed || "Analyze the attached file(s).", pendingAttachments);
      const displayContent =
        pendingAttachments.length > 0
          ? `${typed || "Analyze the attached file(s)."}\n📎 ${pendingAttachments.map((a) => a.name).join(", ")}`
          : typed;

      const userMsg: UserMessage = { id: uid(), role: "user", content: displayContent };
      const priorMessages = [...messages, userMsg];
      setMessages((prev) => [...prev, userMsg]);
      setInput("");
      setAttachments([]);
      setLoading(true);
      setStatusMessage(null);
      const requestController = new AbortController();
      requestControllerRef.current = requestController;
      const requestId = createAgentRequestId();

      const existingCtx = existingAppContext(activeAppId, priorMessages.slice(0, -1));
      const hasProjectFiles = (existingCtx?.files?.length ?? 0) > 0;
      const resolved = resolveAgentIntent(q, { hasProjectFiles });
      setIntentLabel(resolved.userLabel);

      if (sessionIdRef.current && messages.length === 0) {
        persistSession(sessionIdRef.current, {
          title: titleFromFirstMessage(displayContent),
          messages: priorMessages,
        });
        refreshSessions();
      }

      try {
        const currentSessionId = sessionIdRef.current;
        let serverConversationId: string | null = null;
        let serverTurnId: string | null = null;
        if (authState.authenticated && currentSessionId) {
          serverConversationId = await ensureServerConversation(currentSessionId);
          if (serverConversationId) {
            // Store only the user-authored text. Extracted attachment content stays in memory.
            serverTurnId = await startServerTurn(
              serverConversationId,
              currentSessionId,
              userMsg.id,
              typed || "Analyze the attached file(s).",
              requestId
            );
            if (serverTurnId) {
              activeServerTurnRef.current = {
                conversationId: serverConversationId,
                turnId: serverTurnId,
              };
            }
            if (requestController.signal.aborted) {
              if (serverTurnId) {
                void withCsrfHeaders().then((headers) =>
                  fetch(
                    `/api/agent/conversations/${serverConversationId}/turns/${serverTurnId}/cancel`,
                    { method: "POST", headers }
                  )
                );
              }
              return;
            }
          }
        }

        const mentioned = inferProductsFromQuery(q);
        const scopedProductId = clampAgentProductId(
          mentioned.length === 1 && mentioned[0] !== "all"
            ? mentioned[0]
            : mentioned.length > 1
              ? "all"
              : searchScope === "all"
                ? "all"
                : productId,
          credentialedProducts
        );

        const agentPayload = {
          query: q,
          mode: resolved.mode,
          language,
          productId: scopedProductId,
          history: historyForApi(priorMessages.slice(0, -1)),
          existingApp: resolved.editExistingApp ? existingCtx : undefined,
          conversationId: serverConversationId ?? undefined,
          turnId: serverTurnId ?? undefined,
          recaptchaToken: (await import("@/lib/recaptcha/client").then((m) =>
            m.obtainRecaptchaToken("ask_ai_submit")
          )) ?? undefined,
        };

        async function postAgent(attempt: number): Promise<Response> {
          const res = await fetch("/api/agent", {
            method: "POST",
            credentials: "include",
            headers: await withCsrfHeaders({
              "Content-Type": "application/json",
              "X-Request-Id": requestId,
            }),
            signal: requestController.signal,
            body: JSON.stringify(agentPayload),
          });
          if (res.status === 401 && attempt === 0) {
            try {
              const preview = await res.clone().json();
              if (preview?.code === "SESSION_EXPIRED") {
                logPanel("Session refreshed — retrying once.");
                clearCsrfTokenCache();
                await new Promise((resolve) => setTimeout(resolve, 150));
                return postAgent(1);
              }
            } catch {
              /* fall through to normal 401 handling */
            }
          }
          return res;
        }

        const res = await postAgent(0);
        const responseRequestId = res.headers.get("x-agent-request-id");
        if (responseRequestId) logPanel(`Agent request ${responseRequestId}`);
        const bodyText = await res.text();
        let data: AgentResponse & {
          error?: string | { message?: string; code?: string };
          code?: string;
          signIn?: string;
          analytics?: {
            logicalQueryId?: string;
            turnId?: string | null;
            conversationId?: string | null;
          };
          recaptchaDegraded?: boolean;
        };
        try {
          data = JSON.parse(bodyText);
        } catch {
          throw new Error(
            res.ok
              ? "The server returned an unreadable response. Try again."
              : `Server error (${res.status}): ${bodyText.slice(0, 200) || res.statusText}. ` +
                  "If this is a timeout, try a shorter or more specific edit request."
          );
        }
        if (!res.ok) {
          const classified = classifyAgentHttpFailure({
            status: res.status,
            code: data.code,
            error: data.error,
          });
          if (classified.shouldRedirectToSignIn) {
            // Prefer API `signIn` (includes Okta connection). Fallback is branded
            // /sign-in → fresh-login → /auth/login?connection=… — never bare authorize.
            const returnPath =
              typeof window !== "undefined"
                ? window.location.pathname + window.location.search
                : "/agent";
            const fallbackSignIn = `/sign-in?returnTo=${encodeURIComponent(returnPath)}`;
            const signIn =
              typeof data.signIn === "string" && data.signIn ? data.signIn : fallbackSignIn;
            logPanel("Session expired — redirecting to sign in.");
            if (typeof window !== "undefined") {
              window.location.assign(signIn);
            }
            throw new Error(classified.message);
          }
          throw new Error(classified.message);
        }

        persistAppResponse(data);

        if (data.app?.files?.length) {
          setSelectedFilePath(data.app.files[0]!.path);
        }

        const assistantMsg: AssistantMessage = {
          id: uid(),
          role: "assistant",
          content: data.workflow,
          response: data,
          conversationId:
            data.analytics?.conversationId ?? serverConversationId ?? null,
          turnId: data.analytics?.turnId ?? serverTurnId ?? null,
          logicalQueryId:
            data.analytics?.logicalQueryId ?? serverTurnId ?? null,
          queryText: displayContent,
        };
        setMessages((prev) => [...prev, assistantMsg]);
        if (data.recaptchaDegraded) {
          logPanel("Abuse protection is degraded — stricter rate limits apply.");
        }
        logPanel(resolved.userLabel);
      } catch (err) {
        if (requestController.signal.aborted) {
          logPanel("Request stopped.");
          return;
        }
        const errMsg: ErrorMessage = {
          id: uid(),
          role: "error",
          content: err instanceof Error ? err.message : "Something went wrong",
        };
        setMessages((prev) => [...prev, errMsg]);
        logPanel(err instanceof Error ? err.message : "Error");
      } finally {
        if (requestControllerRef.current === requestController) {
          requestControllerRef.current = null;
          activeServerTurnRef.current = null;
        }
        setLoading(false);
        setIntentLabel(null);
        inputRef.current?.focus();
      }
    },
    [
      input,
      attachments,
      loading,
      extracting,
      messages,
      language,
      activeAppId,
      persistAppResponse,
      productId,
      searchScope,
      credentialedProducts,
      authState.authenticated,
      ensureServerConversation,
      logPanel,
      refreshSessions,
      setSelectedFilePath,
      startServerTurn,
    ]
  );

  const cancel = useCallback(() => {
    const controller = requestControllerRef.current;
    if (!controller || controller.signal.aborted) return;
    controller.abort();
    const activeTurn = activeServerTurnRef.current;
    if (activeTurn) {
      void withCsrfHeaders().then((headers) =>
        fetch(
          `/api/agent/conversations/${activeTurn.conversationId}/turns/${activeTurn.turnId}/cancel`,
          { method: "POST", headers }
        )
      );
    }
    setStatusMessage("Request stopped.");
  }, []);

  const handleDeploySuccess = useCallback(
    (info: { deploymentUrl: string; deploymentId: string; projectName: string }) => {
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
      if (sessionIdRef.current) {
        persistSession(sessionIdRef.current, {
          lastDeploy: {
            url: info.deploymentUrl,
            projectName: info.projectName,
            at: new Date().toISOString(),
          },
        });
      }
      logPanel(`Deployed to ${info.deploymentUrl}`);
      refreshSessions();
    },
    [activeAppId, logPanel, refreshSessions]
  );

  const loadSavedAppIntoChat = useCallback(
    (appId: string) => {
      const app = getSavedApp(appId);
      const version = app ? getLatestVersion(app) : undefined;
      if (!app || !version) return;
      setActiveAppIdState(appId);
      const blueprint = blueprintFromVersion(app, version);
      const response: AgentResponse = {
        mode: "app",
        workflow: `Loaded **${app.title}** v${version.version}. Describe changes in plain English — I'll update the app and you can preview or deploy again.`,
        confidence: 1,
        fallback: false,
        citations: [],
        steps: [],
        app: blueprint,
      };
      const nextMessages: ChatMessage[] = [
        {
          id: uid(),
          role: "assistant",
          content: response.workflow,
          response,
        },
      ];
      setMessages(nextMessages);
      setSelectedFilePath(blueprint.files[0]?.path ?? null);
      if (sessionIdRef.current) {
        persistSession(sessionIdRef.current, {
          activeAppId: appId,
          title: app.title,
          messages: nextMessages,
        });
        refreshSessions();
      }
    },
    [refreshSessions, setSelectedFilePath]
  );

  const removeAttachment = useCallback((index: number) => {
    setAttachments((prev) => prev.filter((_, idx) => idx !== index));
  }, []);

  const clearActiveApp = useCallback(() => {
    setActiveAppIdState(null);
    setActiveAppId(null);
    if (sessionIdRef.current) {
      persistSession(sessionIdRef.current, { activeAppId: null });
      refreshSessions();
    }
  }, [refreshSessions]);

  const triggerDeploy = useCallback(() => {
    if (!projectApp) {
      logPanel("No project to deploy — ask me to build an app first.");
      return;
    }
    setShowDeployModal(true);
    logPanel("Opening deploy…");
  }, [projectApp, logPanel]);

  const triggerCommit = useCallback(async () => {
    if (!projectApp?.files?.length) {
      logPanel("No files to commit.");
      return;
    }
    setCommitting(true);
    try {
      const res = await fetch("/api/agent/commit", {
        method: "POST",
        headers: await withCsrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          title: projectApp.title,
          summary: `Update ${projectApp.title}`,
          files: projectApp.files.map((f) => ({ path: f.path, code: f.code })),
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        suggestedMessage?: string;
        message?: string;
      };
      if (!res.ok) {
        logPanel(data.error ?? "Commit blocked — developer access required.");
        setMessages((prev) => [
          ...prev,
          {
            id: uid(),
            role: "error",
            content:
              data.error ??
              "Saving to Git isn't available in this environment. Download the project zip instead.",
          },
        ]);
        return;
      }
      logPanel(data.message ?? `Commit preview: ${data.suggestedMessage}`);
      setMessages((prev) => [
        ...prev,
        {
          id: uid(),
          role: "assistant",
          content: data.message ?? `Suggested commit: ${data.suggestedMessage}`,
          response: {
            mode: "app",
            workflow: data.message ?? `Suggested commit: ${data.suggestedMessage}`,
            confidence: 1,
            fallback: false,
            citations: [],
            steps: [],
          },
        },
      ]);
    } catch (e) {
      logPanel(e instanceof Error ? e.message : "Commit failed");
    } finally {
      setCommitting(false);
    }
  }, [projectApp, logPanel]);

  const triggerPreview = useCallback(() => {
    if (!projectApp) {
      logPanel("Nothing to preview yet.");
      return;
    }
    logPanel("Preview — inspect files in the project panel.");
    void send("Explain this app simply — what does each main file do?");
  }, [projectApp, logPanel, send]);

  const downloadProjectZip = useCallback(async () => {
    if (!projectApp?.files?.length) return;
    logPanel("Downloading project zip…");
    const res = await fetch("/api/agent/zip", {
      method: "POST",
      headers: await withCsrfHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        files: projectApp.files.map((f) => ({ path: f.path, code: f.code })),
        appName: projectApp.title,
      }),
    });
    if (!res.ok) {
      logPanel("Download failed.");
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${projectApp.title.replace(/\s+/g, "-").toLowerCase()}.zip`;
    a.click();
    URL.revokeObjectURL(url);
    logPanel("Download started.");
  }, [projectApp, logPanel]);

  const value: AgentChatState = {
    messages,
    input,
    setInput,
    language,
    setLanguage,
    showSettings,
    setShowSettings,
    showImport,
    setShowImport,
    activeAppId,
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
    handleSelectApp,
    clearActiveApp,
    removeAttachment,
    triggerDeploy,
    triggerCommit,
    triggerPreview,
    downloadProjectZip,
    showDeployModal,
    setShowDeployModal,
  };

  return <AgentChatContext.Provider value={value}>{children}</AgentChatContext.Provider>;
}

export function useAgentChat(): AgentChatState {
  const ctx = useContext(AgentChatContext);
  if (!ctx) throw new Error("useAgentChat must be used within AgentChatProvider");
  return ctx;
}

"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { inferProductFromQuery } from "@/lib/products/registry";
import { useProduct } from "./ProductContext";
import { blueprintFromVersion, getLatestVersion, getSavedApp } from "./AgentSavedAppsBar";
import type { AgentLanguage, AgentMode, AgentResponse, ExistingAppContext } from "@/lib/agent/types";
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

export type UserMessage = { id: string; role: "user"; content: string };
export type AssistantMessage = {
  id: string;
  role: "assistant";
  content: string;
  response: AgentResponse;
};
export type ErrorMessage = { id: string; role: "error"; content: string };
export type ChatMessage = UserMessage | AssistantMessage | ErrorMessage;

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

export type AgentChatState = {
  messages: ChatMessage[];
  input: string;
  setInput: (value: string) => void;
  mode: AgentMode;
  setMode: (mode: AgentMode) => void;
  language: AgentLanguage;
  setLanguage: (language: AgentLanguage) => void;
  llmKey: string;
  setLlmKey: (key: string) => void;
  showSettings: boolean;
  setShowSettings: React.Dispatch<React.SetStateAction<boolean>>;
  showImport: boolean;
  setShowImport: (show: boolean) => void;
  activeAppId: string | null;
  loading: boolean;
  attachments: AgentAttachment[];
  extracting: boolean;
  dragOver: boolean;
  setDragOver: (over: boolean) => void;
  bottomRef: React.RefObject<HTMLDivElement | null>;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  newChat: () => void;
  addFiles: (list: FileList | File[] | null) => Promise<void>;
  send: (text?: string) => Promise<void>;
  handleDeploySuccess: (info: {
    deploymentUrl: string;
    deploymentId: string;
    projectName: string;
  }) => void;
  loadSavedAppIntoChat: (appId: string) => void;
  handleSelectApp: (appId: string | null) => void;
  clearActiveApp: () => void;
  removeAttachment: (index: number) => void;
};

const AgentChatContext = createContext<AgentChatState | null>(null);

export function AgentChatProvider({ children }: { children: ReactNode }) {
  const { productId, searchScope } = useProduct();
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

  useEffect(() => {
    setActiveAppIdState(loadActiveAppId());
  }, []);

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

  const newChat = useCallback(() => {
    setMessages([]);
    setInput("");
    setAttachments([]);
    inputRef.current?.focus();
  }, []);

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
      setMessages((prev) => [...prev, userMsg]);
      setInput("");
      setAttachments([]);
      setLoading(true);

      const priorMessages = [...messages, userMsg].slice(0, -1);
      const existingApp = mode === "app" ? existingAppContext(activeAppId, priorMessages) : undefined;

      try {
        const inferred = inferProductFromQuery(q);
        const scopedProductId =
          inferred && inferred !== "all"
            ? inferred
            : searchScope === "all"
              ? "all"
              : productId;

        const res = await fetch("/api/agent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: q,
            mode,
            language,
            productId: scopedProductId,
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
          throw new Error(
            res.ok
              ? "The server returned an unreadable response. Try again."
              : `Server error (${res.status}): ${bodyText.slice(0, 200) || res.statusText}. ` +
                  "If this is a timeout, try a shorter or more specific edit request."
          );
        }
        if (!res.ok) {
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

        if (mode === "app" && data.mode === "app" && data.app) {
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
    },
    [
      input,
      attachments,
      loading,
      extracting,
      messages,
      mode,
      language,
      llmKey,
      activeAppId,
      persistAppResponse,
      productId,
      searchScope,
    ]
  );

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
    },
    [activeAppId]
  );

  const loadSavedAppIntoChat = useCallback((appId: string) => {
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
  }, []);

  const removeAttachment = useCallback((index: number) => {
    setAttachments((prev) => prev.filter((_, idx) => idx !== index));
  }, []);

  const clearActiveApp = useCallback(() => {
    setActiveAppIdState(null);
    setActiveAppId(null);
  }, []);

  const value: AgentChatState = {
    messages,
    input,
    setInput,
    mode,
    setMode,
    language,
    setLanguage,
    llmKey,
    setLlmKey,
    showSettings,
    setShowSettings,
    showImport,
    setShowImport,
    activeAppId,
    loading,
    attachments,
    extracting,
    dragOver,
    setDragOver,
    bottomRef,
    inputRef,
    fileInputRef,
    newChat,
    addFiles,
    send,
    handleDeploySuccess,
    loadSavedAppIntoChat,
    handleSelectApp,
    clearActiveApp,
    removeAttachment,
  };

  return <AgentChatContext.Provider value={value}>{children}</AgentChatContext.Provider>;
}

export function useAgentChat(): AgentChatState {
  const ctx = useContext(AgentChatContext);
  if (!ctx) throw new Error("useAgentChat must be used within AgentChatProvider");
  return ctx;
}

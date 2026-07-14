import type { AgentLanguage } from "./types";

/** Serialized chat message for localStorage persistence. */
export type StoredChatMessage =
  | { id: string; role: "user"; content: string }
  | { id: string; role: "assistant"; content: string; response: unknown }
  | { id: string; role: "error"; content: string };

export interface AgentWorkspaceSession {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: StoredChatMessage[];
  /** Server-side conversation UUID when this local chat has been authenticated. */
  serverConversationId?: string;
  /** Most recently started server turn; reserved for future streaming/finalization. */
  serverTurnId?: string;
  language: AgentLanguage;
  productId?: string;
  searchScope: "product" | "all";
  activeAppId?: string | null;
  selectedFilePath?: string | null;
  panelLogs: string[];
  lastDeploy?: { url: string; projectName: string; at: string };
  lastCommit?: { message: string; at: string; fileCount: number };
}

export interface AgentWorkspaceStore {
  version: 1;
  activeSessionId: string | null;
  sessions: AgentWorkspaceSession[];
}

const STORAGE_KEY = "cyware-agent-workspace-v1";

function nowIso(): string {
  return new Date().toISOString();
}

export function newSessionId(): string {
  return `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function titleFromFirstMessage(text: string): string {
  const line = text.split("\n")[0]?.trim() ?? "New chat";
  return line.length > 48 ? `${line.slice(0, 48)}…` : line || "New chat";
}

function readStore(): AgentWorkspaceStore {
  if (typeof window === "undefined" && typeof globalThis.localStorage === "undefined") {
    return { version: 1, activeSessionId: null, sessions: [] };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { version: 1, activeSessionId: null, sessions: [] };
    const parsed = JSON.parse(raw) as AgentWorkspaceStore;
    if (parsed.version !== 1 || !Array.isArray(parsed.sessions)) {
      return { version: 1, activeSessionId: null, sessions: [] };
    }
    return parsed;
  } catch {
    return { version: 1, activeSessionId: null, sessions: [] };
  }
}

function writeStore(store: AgentWorkspaceStore): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

export function loadWorkspaceStore(): AgentWorkspaceStore {
  const store = readStore();
  if (store.sessions.length === 0) {
    const session = createEmptySession();
    store.sessions = [session];
    store.activeSessionId = session.id;
    writeStore(store);
  } else if (!store.activeSessionId) {
    store.activeSessionId = store.sessions[0]!.id;
    writeStore(store);
  }
  return store;
}

export function createEmptySession(): AgentWorkspaceSession {
  const t = nowIso();
  return {
    id: newSessionId(),
    title: "New chat",
    createdAt: t,
    updatedAt: t,
    messages: [],
    language: "python",
    searchScope: "product",
    activeAppId: null,
    selectedFilePath: null,
    panelLogs: [],
  };
}

export function listSessions(): AgentWorkspaceSession[] {
  return readStore().sessions.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function getActiveSession(): AgentWorkspaceSession | null {
  const store = loadWorkspaceStore();
  return store.sessions.find((s) => s.id === store.activeSessionId) ?? store.sessions[0] ?? null;
}

export function getSession(id: string): AgentWorkspaceSession | undefined {
  return readStore().sessions.find((s) => s.id === id);
}

export function setActiveSession(id: string): AgentWorkspaceSession | null {
  const store = readStore();
  const session = store.sessions.find((s) => s.id === id);
  if (!session) return null;
  store.activeSessionId = id;
  writeStore(store);
  return session;
}

export function upsertSession(session: AgentWorkspaceSession): void {
  const store = readStore();
  const idx = store.sessions.findIndex((s) => s.id === session.id);
  const updated = { ...session, updatedAt: nowIso() };
  if (idx === -1) store.sessions.unshift(updated);
  else store.sessions[idx] = updated;
  store.activeSessionId = session.id;
  writeStore(store);
}

export function createSession(): AgentWorkspaceSession {
  const session = createEmptySession();
  const store = readStore();
  store.sessions.unshift(session);
  store.activeSessionId = session.id;
  writeStore(store);
  return session;
}

export function deleteSession(id: string): void {
  const store = readStore();
  store.sessions = store.sessions.filter((s) => s.id !== id);
  if (store.activeSessionId === id) {
    store.activeSessionId = store.sessions[0]?.id ?? null;
  }
  if (store.sessions.length === 0) {
    const session = createEmptySession();
    store.sessions = [session];
    store.activeSessionId = session.id;
  }
  writeStore(store);
}

export function renameSession(id: string, title: string): void {
  const store = readStore();
  const session = store.sessions.find((s) => s.id === id);
  if (!session) return;
  session.title = title.trim() || session.title;
  session.updatedAt = nowIso();
  writeStore(store);
}

export function appendSessionLog(sessionId: string, line: string): void {
  const store = readStore();
  const session = store.sessions.find((s) => s.id === sessionId);
  if (!session) return;
  session.panelLogs = [...session.panelLogs.slice(-199), `[${new Date().toLocaleTimeString()}] ${line}`];
  session.updatedAt = nowIso();
  writeStore(store);
}

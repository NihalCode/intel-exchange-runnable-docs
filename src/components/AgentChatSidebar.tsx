"use client";

import { Plus, Pencil, Trash2 } from "lucide-react";
import type { AgentWorkspaceSession } from "@/lib/agent/workspace-client";

function formatWhen(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const sameDay =
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate();
    if (sameDay) {
      return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    }
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

export function AgentChatSidebar({
  sessions,
  activeSessionId,
  onSelect,
  onNew,
  onRename,
  onDelete,
}: {
  sessions: AgentWorkspaceSession[];
  activeSessionId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <aside className="atlas-panel" data-layout="cx-ask-sidebar" aria-label="Chat sessions">
      <div className="atlas-panel__header">
        <div>
          <p className="atlas-micro-label">History</p>
          <p className="mt-0.5 text-[11px] text-[var(--text-secondary)]">Conversations</p>
        </div>
        <button
          type="button"
          onClick={onNew}
          className="inline-flex min-h-9 items-center gap-1 rounded-[var(--radius-sm)] border border-[color-mix(in_srgb,var(--accent-ai)_40%,transparent)] bg-[var(--accent-ai)] px-2.5 py-1.5 text-[11px] font-semibold text-white transition hover:opacity-90"
          aria-label="New conversation"
        >
          <Plus className="h-3 w-3" aria-hidden="true" />
          New conversation
        </button>
      </div>
      <ul data-top-chrome-scroll className="scroll-thin flex-1 overflow-y-auto p-2">
        {sessions.length === 0 ? (
          <li className="px-2 py-6 text-center text-xs text-[var(--text-muted)]">
            No conversations yet. Start a new conversation to begin.
          </li>
        ) : null}
        {sessions.map((s) => {
          const active = s.id === activeSessionId;
          return (
            <li key={s.id} className="group mb-1">
              <button
                type="button"
                onClick={() => onSelect(s.id)}
                data-active={active ? "true" : "false"}
                aria-current={active ? "true" : undefined}
                className="cx-ask-session"
              >
                <div className="truncate text-xs font-medium text-[var(--text-heading)]">
                  {s.title}
                </div>
                <div className="mt-0.5 font-mono text-[10px] text-[var(--text-muted)]">
                  {formatWhen(s.updatedAt)}
                </div>
              </button>
              <div className="mt-0.5 flex flex-wrap gap-1 px-1">
                <button
                  type="button"
                  className="inline-flex min-h-8 items-center gap-0.5 px-1 text-[11px] text-[var(--text-muted)] hover:text-[var(--accent-ai)]"
                  onClick={() => {
                    const next = window.prompt("Rename conversation", s.title);
                    if (next?.trim()) onRename(s.id, next.trim());
                  }}
                >
                  <Pencil className="h-3 w-3" aria-hidden="true" />
                  Rename
                </button>
                <button
                  type="button"
                  className="inline-flex min-h-8 items-center gap-0.5 px-1 text-[11px] text-[var(--text-muted)] hover:text-[var(--danger)]"
                  onClick={() => {
                    if (window.confirm(`Delete "${s.title}"?`)) onDelete(s.id);
                  }}
                >
                  <Trash2 className="h-3 w-3" aria-hidden="true" />
                  Delete
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}

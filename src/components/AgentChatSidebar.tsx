"use client";

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
    <aside className="cx-ask-sidebar" data-layout="cx-ask-sidebar" aria-label="Chat sessions">
      <div className="cx-ask-sidebar__head">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
            Sessions
          </p>
          <p className="mt-0.5 text-[11px] text-[var(--text-secondary)]">Signal history</p>
        </div>
        <button
          type="button"
          onClick={onNew}
          className="rounded-[var(--radius-md)] bg-[var(--accent-primary)] px-2.5 py-1 text-[11px] font-semibold text-white shadow-[0_4px_12px_color-mix(in_srgb,var(--accent-primary)_28%,transparent)] transition hover:bg-[var(--accent-primary-hover)]"
        >
          New
        </button>
      </div>
      <ul data-top-chrome-scroll className="scroll-thin flex-1 overflow-y-auto p-2">
        {sessions.length === 0 ? (
          <li className="px-2 py-6 text-center text-[11px] text-[var(--text-muted)]">
            No sessions yet. Start a new inquiry.
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
                <div className="mt-0.5 text-[10px] text-[var(--text-muted)]">
                  {formatWhen(s.updatedAt)}
                </div>
              </button>
              <div className="mt-0.5 hidden gap-1 px-1 group-hover:flex group-focus-within:flex">
                <button
                  type="button"
                  className="text-[10px] text-[var(--text-muted)] hover:text-[var(--accent-primary)]"
                  onClick={() => {
                    const next = window.prompt("Rename chat", s.title);
                    if (next?.trim()) onRename(s.id, next.trim());
                  }}
                >
                  Rename
                </button>
                <button
                  type="button"
                  className="text-[10px] text-[var(--text-muted)] hover:text-[var(--danger)]"
                  onClick={() => {
                    if (window.confirm(`Delete "${s.title}"?`)) onDelete(s.id);
                  }}
                >
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

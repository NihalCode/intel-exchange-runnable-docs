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
    <aside className="flex w-56 shrink-0 flex-col border-r border-zinc-200 bg-zinc-50/80 dark:border-zinc-800 dark:bg-zinc-900/40">
      <div className="flex items-center justify-between border-b border-zinc-200 px-3 py-2.5 dark:border-zinc-800">
        <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Chats</span>
        <button
          type="button"
          onClick={onNew}
          className="rounded-md bg-sky-600 px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-sky-700"
        >
          New
        </button>
      </div>
      <ul className="flex-1 overflow-y-auto p-2">
        {sessions.map((s) => {
          const active = s.id === activeSessionId;
          return (
            <li key={s.id} className="group mb-1">
              <button
                type="button"
                onClick={() => onSelect(s.id)}
                className={`w-full rounded-lg px-2.5 py-2 text-left transition ${
                  active
                    ? "bg-white shadow-sm ring-1 ring-sky-200 dark:bg-zinc-950 dark:ring-sky-900"
                    : "hover:bg-white/80 dark:hover:bg-zinc-950/60"
                }`}
              >
                <div className="truncate text-xs font-medium text-zinc-800 dark:text-zinc-200">
                  {s.title}
                </div>
                <div className="mt-0.5 text-[10px] text-zinc-400">{formatWhen(s.updatedAt)}</div>
              </button>
              <div className="mt-0.5 hidden gap-1 px-1 group-hover:flex">
                <button
                  type="button"
                  className="text-[10px] text-zinc-500 hover:text-sky-600"
                  onClick={() => {
                    const next = window.prompt("Rename chat", s.title);
                    if (next?.trim()) onRename(s.id, next.trim());
                  }}
                >
                  Rename
                </button>
                <button
                  type="button"
                  className="text-[10px] text-zinc-500 hover:text-red-600"
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

"use client";

import type { ReactNode } from "react";

import { buttonSecondaryClass } from "@/components/admin/ui/tokens";
import { useFocusTrap } from "@/components/useFocusTrap";
import type { EnterprisePermission } from "@/lib/enterprise/types";

export function PermissionGate({
  permission,
  hasPermission,
  children,
  fallback,
}: {
  permission: EnterprisePermission;
  hasPermission: (p: EnterprisePermission) => boolean;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  if (!hasPermission(permission)) {
    return (
      fallback ?? (
        <p className="rounded-md border border-zinc-200 px-4 py-6 text-sm text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
          You do not have permission to view this section.
        </p>
      )
    );
  }
  return <>{children}</>;
}

export function MethodBadge({ method }: { method: string }) {
  const colors: Record<string, string> = {
    GET: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
    POST: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
    PUT: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
    PATCH: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300",
    DELETE: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  };
  const upper = method.toUpperCase();
  return (
    <span
      className={`inline-flex rounded px-1.5 py-0.5 font-mono text-xs font-bold ${colors[upper] ?? "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"}`}
    >
      {upper}
    </span>
  );
}

export function FilterBar({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/50">
      {children}
    </div>
  );
}

export function TableToolbar({ children }: { children: ReactNode }) {
  return <div className="mb-3 flex flex-wrap items-center justify-between gap-3">{children}</div>;
}

export function HealthStatusRow({
  name,
  status,
  latencyMs,
}: {
  name: string;
  status: "healthy" | "degraded" | "down";
  latencyMs?: number;
}) {
  const dot =
    status === "healthy"
      ? "bg-emerald-500"
      : status === "degraded"
        ? "bg-amber-500"
        : "bg-red-500";
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${dot}`} aria-hidden="true" />
        <span className="text-sm font-medium">{name}</span>
      </div>
      <span className="text-xs tabular-nums text-zinc-500">
        {typeof latencyMs === "number" ? `${latencyMs} ms` : "—"}
      </span>
    </div>
  );
}

export function CodeViewer({ code, title }: { code: string; title?: string }) {
  return (
    <div>
      {title ? <p className="mb-2 text-sm font-medium">{title}</p> : null}
      <pre className="overflow-x-auto rounded-md border border-zinc-200 bg-zinc-50 p-3 font-mono text-xs dark:border-zinc-800 dark:bg-zinc-900">
        {code}
      </pre>
    </div>
  );
}

export function ConfigurationDiff({
  before,
  after,
}: {
  before: Record<string, unknown>;
  after: Record<string, unknown>;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <CodeViewer code={JSON.stringify(before, null, 2)} title="Current" />
      <CodeViewer code={JSON.stringify(after, null, 2)} title="Proposed" />
    </div>
  );
}

export function DetailsDrawer({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const drawerRef = useFocusTrap(open, onClose);

  if (!open) return null;
  return (
    <div
      ref={drawerRef}
      tabIndex={-1}
      className="fixed inset-0 z-50 flex justify-end bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-labelledby="drawer-title"
    >
      <button type="button" className="flex-1" aria-label="Close drawer" onClick={onClose} />
      <div className="flex h-full w-full max-w-lg flex-col border-l border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <h2 id="drawer-title" className="font-semibold">
            {title}
          </h2>
          <button type="button" className={buttonSecondaryClass} onClick={onClose}>
            Close
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );
}

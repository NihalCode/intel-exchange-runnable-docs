"use client";

const STATUS_STYLES: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  healthy: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  success: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  synced: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  connected: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  pending: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  scheduled: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  degraded: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  draft: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  disabled: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
  rejected: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  error: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  down: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  revoked: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  failed: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
};

export function normalizeStatusLabel(status: string): string {
  return status.replaceAll("_", " ");
}

export function statusBadgeClass(status: string): string {
  const key = status.toLowerCase();
  return STATUS_STYLES[key] ?? "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300";
}

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium capitalize ${statusBadgeClass(status)}`}
    >
      {normalizeStatusLabel(status)}
    </span>
  );
}

"use client";

import { useState } from "react";

import { useAdmin } from "@/components/admin/context/AdminContext";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { StatusBadge } from "@/components/admin/ui/StatusBadge";
import type { UnansweredQueryReviewRow } from "@/lib/query-analytics/repository";

export function UnansweredQueriesPage({
  initialRows,
}: {
  initialRows: UnansweredQueryReviewRow[];
}) {
  const { organization, hasPermission } = useAdmin();
  const canManage = hasPermission("unanswered_queries.manage");
  const [rows, setRows] = useState(initialRows);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function updateStatus(id: string, status: UnansweredQueryReviewRow["status"]) {
    if (!canManage) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/unanswered-queries/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("Update failed");
      setRows((prev) => prev.map((row) => (row.id === id ? { ...row, status } : row)));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        eyebrow={organization.name}
        title="Unanswered queries"
        description="Review Ask AI turns classified as unanswered or partially answered."
      />
      {!canManage ? (
        <p className="text-xs text-zinc-500">Read-only view.</p>
      ) : null}
      {rows.length === 0 ? (
        <p className="text-sm text-zinc-500">No unanswered query reviews yet.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li
              key={row.id}
              className="rounded border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-800"
            >
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={row.status} />
                <span className="font-mono text-xs">{row.outcome ?? "unknown"}</span>
                <span className="text-xs text-zinc-500">{row.productId ?? "—"}</span>
                <span className="text-xs text-zinc-500">{row.hostname ?? "—"}</span>
                <span className="text-xs text-zinc-400">
                  {new Date(row.updatedAt).toLocaleString()}
                </span>
              </div>
              {canManage ? (
                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                  {(["in_review", "resolved", "dismissed"] as const).map((status) => (
                    <button
                      key={status}
                      type="button"
                      disabled={busyId === row.id || row.status === status}
                      onClick={() => void updateStatus(row.id, status)}
                      className="rounded border border-zinc-300 px-2 py-0.5 disabled:opacity-50 dark:border-zinc-600"
                    >
                      Mark {status.replace("_", " ")}
                    </button>
                  ))}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { useAdmin } from "@/components/admin/context/AdminContext";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { StatusBadge } from "@/components/admin/ui/StatusBadge";
import { UNANSWERED_QUERY_REVIEW_STATUSES } from "@/lib/domains/types";
import type { UnansweredQueryReviewRow } from "@/lib/query-analytics/repository";
import type { UnansweredSummary } from "@/lib/query-analytics/unanswered-types";

const WORKFLOW_STATUSES = UNANSWERED_QUERY_REVIEW_STATUSES.filter(
  (status) => status !== "NEW"
);

const POLL_MS = 15_000;

export function UnansweredQueriesPage({
  initialRows,
  refreshedAt,
  realtimeEnabled = false,
}: {
  initialRows: UnansweredQueryReviewRow[];
  refreshedAt: string;
  realtimeEnabled?: boolean;
}) {
  const { organization, hasPermission, csrfToken } = useAdmin();
  const canManage = hasPermission("unanswered_queries.manage");
  const canReadSensitive =
    hasPermission("query_analytics.read_sensitive") ||
    hasPermission("unanswered_queries.read_sensitive");
  const [rows, setRows] = useState(initialRows);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [summary, setSummary] = useState<UnansweredSummary | null>(null);
  const [summaryAt, setSummaryAt] = useState(refreshedAt);
  const [summaryStale, setSummaryStale] = useState(false);
  const [revealed, setRevealed] = useState<
    Record<string, { queryText: string | null; clientIp: string | null }>
  >({});

  useEffect(() => {
    if (!realtimeEnabled) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function poll() {
      try {
        const res = await fetch("/api/admin/unanswered-queries/summary");
        if (!res.ok) {
          if (!cancelled) setSummaryStale(true);
          return;
        }
        const data = (await res.json()) as UnansweredSummary;
        if (cancelled) return;
        setSummary(data);
        setSummaryAt(data.refreshedAt);
        setSummaryStale(false);
      } catch {
        if (!cancelled) setSummaryStale(true);
      } finally {
        if (!cancelled) {
          timer = setTimeout(() => void poll(), POLL_MS);
        }
      }
    }

    void poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [realtimeEnabled]);

  async function updateStatus(id: string, status: UnansweredQueryReviewRow["status"]) {
    if (!canManage) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/unanswered-queries/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
        },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("Update failed");
      setRows((prev) => prev.map((row) => (row.id === id ? { ...row, status } : row)));
    } finally {
      setBusyId(null);
    }
  }

  async function revealSensitive(id: string) {
    if (!canReadSensitive) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/unanswered-queries/${id}?sensitive=1`);
      if (!res.ok) throw new Error("Reveal failed");
      const data = (await res.json()) as {
        queryText: string | null;
        clientIp: string | null;
      };
      setRevealed((prev) => ({ ...prev, [id]: data }));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        eyebrow={organization.name}
        title="Unanswered queries"
        description="Triage Ask AI gaps using Phase 10 review statuses (documentation, retrieval, product, connector, access)."
      />
      <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-500">
        <span>
          List refreshed {new Date(refreshedAt).toLocaleString()} · Exact query text requires
          sensitive permission
        </span>
        <Link
          href="/admin/documentation-agent/unanswered/weekly"
          className="underline-offset-2 hover:underline"
        >
          Weekly analytics
        </Link>
      </div>

      {realtimeEnabled && summary ? (
        <div className="grid gap-2 sm:grid-cols-4">
          <SummaryCard label="Open" value={summary.totalOpen} />
          <SummaryCard label="New" value={summary.totalNew} />
          <SummaryCard
            label="Outcomes"
            value={Object.keys(summary.byOutcome).length}
            hint="distinct"
          />
          <SummaryCard
            label="Poll"
            value={summaryStale ? "stale" : "live"}
            hint={new Date(summaryAt).toLocaleTimeString()}
          />
        </div>
      ) : null}

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
              {row.sanitizedTopic ? (
                <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                  Topic: {row.sanitizedTopic}
                </p>
              ) : null}
              {revealed[row.id]?.queryText ? (
                <pre className="mt-2 max-h-32 overflow-auto rounded bg-zinc-100 p-2 text-xs dark:bg-zinc-900">
                  {revealed[row.id]!.queryText}
                </pre>
              ) : null}
              {revealed[row.id]?.clientIp ? (
                <p className="mt-1 font-mono text-xs text-zinc-500">
                  IP: {revealed[row.id]!.clientIp}
                </p>
              ) : null}
              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                {canReadSensitive && !revealed[row.id] ? (
                  <button
                    type="button"
                    disabled={busyId === row.id}
                    onClick={() => void revealSensitive(row.id)}
                    className="rounded border border-amber-400 px-2 py-0.5 disabled:opacity-50 dark:border-amber-700"
                  >
                    Reveal exact query
                  </button>
                ) : null}
                {canManage
                  ? WORKFLOW_STATUSES.map((status) => (
                      <button
                        key={status}
                        type="button"
                        disabled={busyId === row.id || row.status === status}
                        onClick={() => void updateStatus(row.id, status)}
                        className="rounded border border-zinc-300 px-2 py-0.5 disabled:opacity-50 dark:border-zinc-600"
                      >
                        {status.replace(/_/g, " ")}
                      </button>
                    ))
                  : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: number | string;
  hint?: string;
}) {
  return (
    <div className="rounded border border-zinc-200 px-3 py-2 dark:border-zinc-800">
      <p className="text-[10px] uppercase tracking-wide text-zinc-400">{label}</p>
      <p className="text-lg font-semibold tabular-nums">{value}</p>
      {hint ? <p className="text-[10px] text-zinc-500">{hint}</p> : null}
    </div>
  );
}

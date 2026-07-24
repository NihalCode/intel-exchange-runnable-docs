"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { useAdmin } from "@/components/admin/context/AdminContext";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { StatusBadge } from "@/components/admin/ui/StatusBadge";
import { UNANSWERED_QUERY_REVIEW_STATUSES } from "@/lib/domains/types";
import type { UnansweredQueryReviewRow } from "@/lib/query-analytics/repository";
import {
  revealStateFromApiResponse,
  shouldHideRevealButton,
  type RevealUiState,
  type SensitiveFieldStatus,
} from "@/lib/query-analytics/reveal-ui";
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
  const { organization, hasPermission, csrfToken, enabledFeatures } = useAdmin();
  const canManage = hasPermission("unanswered_queries.manage");
  const canReadSensitive =
    hasPermission("query_analytics.read_sensitive") ||
    hasPermission("unanswered_queries.read_sensitive");
  const weeklyAnalyticsEnabled = enabledFeatures.includes(
    "unanswered_query_weekly_analytics"
  );
  const [rows, setRows] = useState(initialRows);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [summary, setSummary] = useState<UnansweredSummary | null>(null);
  const [summaryAt, setSummaryAt] = useState(refreshedAt);
  const [summaryStale, setSummaryStale] = useState(false);
  const [revealById, setRevealById] = useState<Record<string, RevealUiState>>({});

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
      let body: {
        queryText?: string | null;
        clientIp?: string | null;
        queryStatus?: SensitiveFieldStatus;
        code?: string;
        error?: string;
      } = {};
      try {
        body = (await res.json()) as typeof body;
      } catch {
        body = {};
      }
      const next = revealStateFromApiResponse(res.status, body);
      setRevealById((prev) => ({ ...prev, [id]: next }));
    } catch {
      setRevealById((prev) => ({
        ...prev,
        [id]: revealStateFromApiResponse(500, { error: "Reveal failed" }),
      }));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div
      className="mx-auto max-w-[var(--workbench-max)] space-y-6"
      data-layout="cx-unanswered-workbench"
    >
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
        {weeklyAnalyticsEnabled ? (
          <Link
            href="/admin/documentation-agent/unanswered/weekly"
            className="underline-offset-2 hover:underline"
          >
            Weekly analytics
          </Link>
        ) : null}
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
          {rows.map((row) => {
            const reveal = revealById[row.id];
            return (
              <li
                key={row.id}
                className="rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--surface-raised)] px-3 py-2 text-sm shadow-[var(--shadow-resting)]"
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
                {reveal?.kind === "revealed" ? (
                  <div
                    className="mt-2 rounded border border-amber-300 bg-amber-50 p-2 dark:border-amber-800 dark:bg-amber-950/40"
                    data-testid="revealed-exact-query"
                  >
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-200">
                      Exact query
                    </p>
                    <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words font-mono text-xs text-zinc-900 dark:text-zinc-100">
                      {reveal.queryText}
                    </pre>
                    {reveal.clientIp ? (
                      <p className="mt-1 font-mono text-xs text-zinc-500">
                        IP: {reveal.clientIp}
                      </p>
                    ) : null}
                  </div>
                ) : null}
                {reveal?.kind === "unavailable" ? (
                  <p
                    className="mt-2 rounded border border-rose-300 bg-rose-50 px-2 py-1.5 text-xs text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200"
                    data-testid="reveal-exact-query-error"
                    role="alert"
                  >
                    {reveal.message}
                  </p>
                ) : null}
                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                  {canReadSensitive && !shouldHideRevealButton(reveal) ? (
                    <button
                      type="button"
                      disabled={busyId === row.id}
                      onClick={() => void revealSensitive(row.id)}
                      className="rounded border border-amber-400 px-2 py-0.5 disabled:opacity-50 dark:border-amber-700"
                      data-testid="reveal-exact-query"
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
            );
          })}
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
    <div className="sf-signal-metric">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
        {label}
      </p>
      <p className="mt-1 text-lg font-semibold tabular-nums text-[var(--text-heading)]">{value}</p>
      {hint ? <p className="text-[10px] text-[var(--text-muted)]">{hint}</p> : null}
    </div>
  );
}

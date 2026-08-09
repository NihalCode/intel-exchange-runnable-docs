"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { LiveStatus } from "@/components/atlas";
import { useAdmin } from "@/components/admin/context/AdminContext";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { StatusBadge } from "@/components/admin/ui/StatusBadge";
import {
  SignalButton,
  SignalEmptyState,
  SignalSelect,
  SignalSkeleton,
} from "@/components/fabric";
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
      className="mx-auto max-w-[var(--workbench-max)] space-y-5"
      data-layout="cx-unanswered-workbench"
    >
      <PageHeader
        eyebrow={organization.name}
        title="Unanswered queries"
        description="Triage Ask AI gaps using Phase 10 review statuses (documentation, retrieval, product, connector, access)."
        actions={
          <LiveStatus
            label={summaryStale ? "Stale" : realtimeEnabled ? "Live queue" : "Static"}
            tone={summaryStale ? "amber" : "signal"}
          />
        }
      />

      <div className="flex flex-wrap items-center gap-3 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--atlas-text-muted)]">
        <span>
          List refreshed {new Date(refreshedAt).toLocaleString()} · Exact query text requires
          sensitive permission
        </span>
        {weeklyAnalyticsEnabled ? (
          <Link
            href="/admin/documentation-agent/unanswered/weekly"
            className="text-[var(--atlas-signal)] underline-offset-2 hover:underline"
          >
            Weekly analytics
          </Link>
        ) : null}
      </div>

      {realtimeEnabled && !summary ? (
        <div
          className="flex gap-2 overflow-x-auto"
          aria-busy="true"
          aria-label="Loading summary"
        >
          <SignalSkeleton className="h-14 w-28 shrink-0 rounded-[var(--radius-sm)]" />
          <SignalSkeleton className="h-14 w-28 shrink-0 rounded-[var(--radius-sm)]" />
          <SignalSkeleton className="h-14 w-28 shrink-0 rounded-[var(--radius-sm)]" />
          <SignalSkeleton className="h-14 w-28 shrink-0 rounded-[var(--radius-sm)]" />
        </div>
      ) : null}

      {/* Queue ticker — distinct from overview/analytics metric grids */}
      {realtimeEnabled && summary ? (
        <div
          className="flex flex-wrap gap-px overflow-hidden rounded-[var(--radius-sm)] border border-[var(--atlas-line)] bg-[var(--atlas-line)]"
          role="group"
          aria-label="Queue summary"
        >
          <QueueChip label="Open" value={summary.totalOpen} />
          <QueueChip label="New" value={summary.totalNew} accent />
          <QueueChip
            label="Outcomes"
            value={Object.keys(summary.byOutcome).length}
            hint="distinct"
          />
          <QueueChip
            label="Poll"
            value={summaryStale ? "stale" : "live"}
            hint={new Date(summaryAt).toLocaleTimeString()}
          />
        </div>
      ) : null}

      {!canManage ? (
        <p className="atlas-micro-label !inline text-[var(--atlas-text-muted)]">Read-only view.</p>
      ) : null}

      {rows.length === 0 ? (
        <SignalEmptyState
          title="No unanswered query reviews yet"
          description="When Ask AI cannot verify a solution, reviews appear here for triage."
        />
      ) : (
        <ul className="space-y-0 divide-y divide-[var(--atlas-line)] rounded-[var(--radius-sm)] border border-[var(--atlas-line)] bg-[color-mix(in_srgb,var(--atlas-elevated)_90%,transparent)]">
          {rows.map((row) => {
            const reveal = revealById[row.id];
            return (
              <li key={row.id} className="px-3 py-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={row.status} />
                  <span className="font-mono text-[11px] text-[var(--atlas-signal)]">
                    {row.outcome ?? "unknown"}
                  </span>
                  <span className="font-mono text-[10px] text-[var(--atlas-text-muted)]">
                    {row.productId ?? "—"}
                  </span>
                  <span className="font-mono text-[10px] text-[var(--atlas-text-muted)]">
                    {row.hostname ?? "—"}
                  </span>
                  <span className="ml-auto font-mono text-[10px] text-[var(--atlas-text-muted)]">
                    {new Date(row.updatedAt).toLocaleString()}
                  </span>
                </div>
                {row.sanitizedTopic ? (
                  <p className="mt-1.5 text-xs text-[var(--atlas-text-secondary)]">
                    Topic: {row.sanitizedTopic}
                  </p>
                ) : null}
                {reveal?.kind === "revealed" ? (
                  <div
                    className="mt-2 rounded-[var(--radius-sm)] border border-[color-mix(in_srgb,var(--atlas-amber)_45%,transparent)] bg-[color-mix(in_srgb,var(--atlas-amber)_12%,transparent)] p-2"
                    data-testid="revealed-exact-query"
                  >
                    <p className="atlas-micro-label text-[var(--atlas-amber)]">Exact query</p>
                    <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words font-mono text-xs text-[var(--atlas-text)]">
                      {reveal.queryText}
                    </pre>
                    {reveal.clientIp ? (
                      <p className="mt-1 font-mono text-xs text-[var(--atlas-text-muted)]">
                        IP: {reveal.clientIp}
                      </p>
                    ) : null}
                  </div>
                ) : null}
                {reveal?.kind === "unavailable" ? (
                  <p
                    className="mt-2 rounded-[var(--radius-sm)] border border-[color-mix(in_srgb,var(--atlas-danger)_40%,transparent)] bg-[color-mix(in_srgb,var(--atlas-danger)_10%,transparent)] px-2 py-1.5 text-xs text-[var(--atlas-danger)]"
                    data-testid="reveal-exact-query-error"
                    role="alert"
                  >
                    {reveal.message}
                  </p>
                ) : null}
                <div className="mt-2 flex flex-wrap items-end gap-2 text-xs">
                  {canReadSensitive && !shouldHideRevealButton(reveal) ? (
                    <SignalButton
                      type="button"
                      size="sm"
                      variant="secondary"
                      disabled={busyId === row.id}
                      onClick={() => void revealSensitive(row.id)}
                      data-testid="reveal-exact-query"
                    >
                      Reveal exact query
                    </SignalButton>
                  ) : null}
                  {canManage ? (
                    <SignalSelect
                      label="Status"
                      value={row.status}
                      disabled={busyId === row.id}
                      onChange={(e) => {
                        const next = e.target.value as UnansweredQueryReviewRow["status"];
                        if (next !== row.status) void updateStatus(row.id, next);
                      }}
                      className="min-w-[12rem]"
                    >
                      {row.status === "NEW" ? (
                        <option value="NEW">NEW</option>
                      ) : null}
                      {WORKFLOW_STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {status.replace(/_/g, " ")}
                        </option>
                      ))}
                    </SignalSelect>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function QueueChip({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: number | string;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`min-w-[6.5rem] flex-1 bg-[var(--atlas-elevated)] px-3 py-2.5 ${
        accent ? "shadow-[inset_0_-2px_0_var(--atlas-signal)]" : ""
      }`}
    >
      <p className="atlas-micro-label">{label}</p>
      <p className="mt-0.5 font-mono text-lg font-medium tabular-nums text-[var(--atlas-text)]">
        {value}
      </p>
      {hint ? (
        <p className="font-mono text-[10px] text-[var(--atlas-text-muted)]">{hint}</p>
      ) : null}
    </div>
  );
}

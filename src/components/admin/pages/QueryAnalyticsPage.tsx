"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { LiveStatus, TelemetryValue } from "@/components/atlas";
import { useAdmin } from "@/components/admin/context/AdminContext";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { buttonSecondaryClass } from "@/components/admin/ui/tokens";
import {
  SignalButton,
  SignalEmptyState,
  SignalErrorState,
  SignalFilterBar,
  SignalInput,
  SignalSelect,
} from "@/components/fabric";
import { listProducts } from "@/lib/products/registry";
import type {
  QueryAnalyticsEventListItem,
  QueryAnalyticsMetrics,
} from "@/lib/query-analytics/repository";

export function QueryAnalyticsPage({
  summary,
  recent,
  initialSince,
  initialUntil,
  initialProductId,
  initialHostname,
  refreshedAt,
  showProductionMetrics,
  loadError,
  loadErrorCode,
}: {
  summary: QueryAnalyticsMetrics;
  recent: QueryAnalyticsEventListItem[];
  initialSince: string;
  initialUntil: string;
  initialProductId?: string;
  initialHostname?: string;
  refreshedAt: string;
  showProductionMetrics?: boolean;
  loadError?: string | null;
  loadErrorCode?: string | null;
}) {
  const { organization, hasPermission } = useAdmin();
  const router = useRouter();
  const products = listProducts();
  const canReadSensitive = hasPermission("query_analytics.read_sensitive");

  const [since, setSince] = useState(initialSince.slice(0, 10));
  const [until, setUntil] = useState(initialUntil.slice(0, 10));
  const [productId, setProductId] = useState(initialProductId ?? "");
  const [hostname, setHostname] = useState(initialHostname ?? "");

  const exportUrl = useMemo(() => {
    const params = new URLSearchParams({ export: "csv", since, until });
    if (productId) params.set("productId", productId);
    if (hostname) params.set("hostname", hostname);
    return `/api/admin/query-analytics?${params.toString()}`;
  }, [since, until, productId, hostname]);

  const sensitiveExportUrl = useMemo(() => {
    const params = new URLSearchParams({
      export: "csv",
      sensitive: "1",
      since,
      until,
    });
    if (productId) params.set("productId", productId);
    if (hostname) params.set("hostname", hostname);
    return `/api/admin/query-analytics?${params.toString()}`;
  }, [since, until, productId, hostname]);

  function applyFilters() {
    const params = new URLSearchParams({ since, until });
    if (productId) params.set("productId", productId);
    if (hostname) params.set("hostname", hostname);
    router.push(`/admin/documentation-agent/query-analytics?${params.toString()}`);
  }

  const denom = summary.answerQualityDenominator || 0;
  const answeredPct =
    denom > 0 ? `${Math.round((summary.answered / denom) * 100)}%` : "—";
  const partialPct =
    denom > 0
      ? `${Math.round((summary.partiallyAnswered / denom) * 100)}%`
      : "—";
  const unansweredPct =
    denom > 0 ? `${Math.round((summary.unanswered / denom) * 100)}%` : "—";

  return (
    <div
      className="mx-auto max-w-[var(--workbench-max)] space-y-5"
      data-testid="query-analytics-page"
      data-layout="cx-analytics-workbench"
    >
      <PageHeader
        eyebrow={organization.name}
        title="Query analytics"
        description="Customer questions, answer outcomes, latency, and exports for the selected range."
        actions={<LiveStatus label="Workbench" tone="signal" />}
      />

      {loadError ? (
        <div data-testid="query-analytics-load-error">
          <SignalErrorState
            title={`Analytics data could not be loaded${
              loadErrorCode ? ` (${loadErrorCode})` : ""
            }`}
            description={`${loadError}. Showing an empty summary — try Reload or Apply filters again.`}
          />
        </div>
      ) : null}

      <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--atlas-text-muted)]">
        Last updated {new Date(refreshedAt).toLocaleString()} · Answer-quality denom = answered +
        partially answered + no verified solution + no results + clarification required ({denom})
      </p>

      <SignalFilterBar className="items-end text-xs" data-layout="cx-analytics-toolbar">
        <SignalInput
          type="date"
          label="From"
          value={since}
          onChange={(e) => setSince(e.target.value)}
        />
        <SignalInput
          type="date"
          label="To"
          value={until}
          onChange={(e) => setUntil(e.target.value)}
        />
        <SignalSelect
          label="Product"
          value={productId}
          onChange={(e) => setProductId(e.target.value)}
        >
          <option value="">All products</option>
          {products.map((p) => (
            <option key={p.productId} value={p.productId}>
              {p.displayLabel}
            </option>
          ))}
        </SignalSelect>
        <SignalInput
          type="text"
          label="Hostname / environment"
          value={hostname}
          onChange={(e) => setHostname(e.target.value)}
          placeholder="All hosts (optional)"
          autoComplete="off"
        />
        <SignalButton type="button" onClick={applyFilters}>
          Apply filters
        </SignalButton>
        <a href={exportUrl} className={buttonSecondaryClass}>
          Export CSV
        </a>
        {canReadSensitive ? (
          <a
            href={sensitiveExportUrl}
            className="inline-flex items-center justify-center rounded-[var(--radius-sm)] border border-[var(--atlas-amber)] bg-[color-mix(in_srgb,var(--atlas-amber)_12%,transparent)] px-3 py-2 text-sm font-medium text-[var(--atlas-text)]"
          >
            Sensitive CSV
          </a>
        ) : null}
      </SignalFilterBar>

      {/* Volume ribbon — horizontal composition, not a metric-card grid */}
      <section
        className="overflow-x-auto rounded-[var(--radius-sm)] border border-[var(--atlas-line)] bg-[color-mix(in_srgb,var(--atlas-elevated)_92%,transparent)]"
        aria-label="Query volume"
      >
        <div className="flex min-w-[40rem] divide-x divide-[var(--atlas-line)]">
          <RibbonCell label="Logical queries" value={String(summary.totalLogicalQueries)} />
          <RibbonCell label="Attempts" value={String(summary.totalAttempts)} />
          <RibbonCell label="Answered" value={String(summary.answered)} hint={answeredPct} />
          <RibbonCell
            label="Partially answered"
            value={String(summary.partiallyAnswered)}
            hint={partialPct}
          />
          <RibbonCell
            label="Unanswered"
            value={String(summary.unanswered)}
            hint={unansweredPct}
            tone="amber"
          />
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <section className="rounded-[var(--radius-sm)] border border-[var(--atlas-line)] p-4">
          <p className="atlas-micro-label text-[var(--atlas-violet)]">Outcome matrix</p>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3">
            <OutcomeRow label="Clarification required" value={summary.clarificationRequired} />
            <OutcomeRow label="Access blocked" value={summary.accessBlocked} />
            <OutcomeRow label="Credential blocked" value={summary.credentialBlocked} />
            <OutcomeRow label="Provider / system errors" value={summary.providerError} />
            <OutcomeRow label="Answer-quality denom" value={summary.answerQualityDenominator} />
            {showProductionMetrics ? (
              <OutcomeRow label="Production metrics" value="enabled" />
            ) : null}
          </dl>
        </section>

        <section className="rounded-[var(--radius-sm)] border border-[var(--atlas-line)] p-4">
          <p className="atlas-micro-label text-[var(--atlas-signal)]">Latency band</p>
          <div className="mt-3 grid grid-cols-3 gap-3">
            <TelemetryValue
              label="p50"
              value={summary.p50LatencyMs == null ? "—" : Math.round(summary.p50LatencyMs)}
              unit="ms"
            />
            <TelemetryValue
              label="p95"
              value={summary.p95LatencyMs == null ? "—" : Math.round(summary.p95LatencyMs)}
              unit="ms"
            />
            <TelemetryValue
              label="Avg"
              value={summary.avgLatencyMs == null ? "—" : Math.round(summary.avgLatencyMs)}
              unit="ms"
            />
          </div>
        </section>
      </div>

      <section>
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="atlas-micro-label">Event stream</h2>
          <span className="font-mono text-[10px] text-[var(--atlas-text-muted)]">
            {recent.length} rows
          </span>
        </div>
        {recent.length === 0 ? (
          <SignalEmptyState title="No analytics recorded yet." />
        ) : (
          <ul className="divide-y divide-[var(--atlas-line)] rounded-[var(--radius-sm)] border border-[var(--atlas-line)] bg-[var(--atlas-deep)] font-mono text-[11px]">
            {recent.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-baseline gap-x-2 gap-y-1 px-3 py-2 text-[var(--atlas-text-secondary)]"
              >
                <span className="text-[var(--atlas-signal)]">{row.outcome}</span>
                <span>·</span>
                <span>{row.productId ?? "—"}</span>
                <span>·</span>
                <span>{row.hostname}</span>
                {row.latencyMs != null ? (
                  <>
                    <span>·</span>
                    <span>{row.latencyMs} ms</span>
                  </>
                ) : null}
                <span className="ml-auto text-[var(--atlas-text-muted)]">
                  {row.createdAt ? new Date(row.createdAt).toLocaleString() : "—"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function RibbonCell({
  label,
  value,
  hint,
  tone = "signal",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "signal" | "amber";
}) {
  return (
    <div className="min-w-[8rem] flex-1 px-4 py-3">
      <p className="atlas-micro-label">{label}</p>
      <p
        className={`mt-1 font-mono text-xl font-medium tabular-nums tracking-tight ${
          tone === "amber" ? "text-[var(--atlas-amber)]" : "text-[var(--atlas-text)]"
        }`}
      >
        {value}
      </p>
      {hint ? (
        <p className="mt-0.5 font-mono text-[10px] text-[var(--atlas-text-muted)]">{hint}</p>
      ) : null}
    </div>
  );
}

function OutcomeRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <dt className="atlas-micro-label">{label}</dt>
      <dd className="mt-0.5 font-mono text-base tabular-nums text-[var(--atlas-text)]">{value}</dd>
    </div>
  );
}

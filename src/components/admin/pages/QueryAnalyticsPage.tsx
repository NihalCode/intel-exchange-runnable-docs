"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { useAdmin } from "@/components/admin/context/AdminContext";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { MetricCard } from "@/components/admin/ui/MetricCard";
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
    denom > 0 ? `${Math.round((summary.answered / denom) * 100)}% of answer-quality` : "—";
  const partialPct =
    denom > 0
      ? `${Math.round((summary.partiallyAnswered / denom) * 100)}% of answer-quality`
      : "—";
  const unansweredPct =
    denom > 0 ? `${Math.round((summary.unanswered / denom) * 100)}% of answer-quality` : "—";

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

      <p className="text-xs text-[var(--text-muted)]">
        Last updated {new Date(refreshedAt).toLocaleString()} · Answer-quality denominator = answered +
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
            className="inline-flex items-center justify-center rounded-[var(--radius-md)] border border-[var(--warning)] bg-[var(--warning-soft)] px-3 py-2 text-sm font-medium text-[var(--text-heading)]"
          >
            Sensitive CSV
          </a>
        ) : null}
      </SignalFilterBar>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 sf-telemetry-strip">
        <MetricCard label="Logical queries" value={String(summary.totalLogicalQueries)} />
        <MetricCard label="Attempts" value={String(summary.totalAttempts)} />
        <MetricCard label="Answered" value={String(summary.answered)} change={answeredPct} />
        <MetricCard
          label="Partially answered"
          value={String(summary.partiallyAnswered)}
          change={partialPct}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Unanswered (review queue)"
          value={String(summary.unanswered)}
          change={unansweredPct}
        />
        <MetricCard
          label="Clarification required"
          value={String(summary.clarificationRequired)}
        />
        <MetricCard label="Access blocked" value={String(summary.accessBlocked)} />
        <MetricCard label="Credential blocked" value={String(summary.credentialBlocked)} />
      </div>
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <MetricCard label="Provider / system errors" value={String(summary.providerError)} />
        <MetricCard
          label="Answer-quality denom"
          value={String(summary.answerQualityDenominator)}
        />
        {showProductionMetrics ? (
          <MetricCard label="Production metrics" value="enabled" />
        ) : null}
        <MetricCard
          label="p50 latency"
          value={summary.p50LatencyMs == null ? "—" : `${Math.round(summary.p50LatencyMs)} ms`}
        />
        <MetricCard
          label="p95 latency"
          value={summary.p95LatencyMs == null ? "—" : `${Math.round(summary.p95LatencyMs)} ms`}
        />
        <MetricCard
          label="Avg latency"
          value={summary.avgLatencyMs == null ? "—" : `${Math.round(summary.avgLatencyMs)} ms`}
        />
      </div>
      <section>
        <h2 className="mb-2 text-sm font-semibold">Recent events</h2>
        {recent.length === 0 ? (
          <SignalEmptyState title="No analytics recorded yet." />
        ) : (
          <ul className="space-y-2 text-xs">
            {recent.map((row) => (
              <li
                key={row.id}
                className="rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--surface-raised)] px-3 py-2"
              >
                <span className="font-mono">{row.outcome}</span>
                {" · "}
                {row.productId ?? "—"}
                {" · "}
                {row.hostname}
                {" · "}
                {row.latencyMs != null ? `${row.latencyMs} ms · ` : ""}
                {row.createdAt ? new Date(row.createdAt).toLocaleString() : "—"}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

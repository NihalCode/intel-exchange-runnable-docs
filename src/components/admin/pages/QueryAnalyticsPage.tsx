"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { useAdmin } from "@/components/admin/context/AdminContext";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { MetricCard } from "@/components/admin/ui/MetricCard";
import { listProducts } from "@/lib/products/registry";
import type { QueryAnalyticsMetrics } from "@/lib/query-analytics/repository";

export function QueryAnalyticsPage({
  summary,
  recent,
  initialSince,
  initialUntil,
  initialProductId,
}: {
  summary: QueryAnalyticsMetrics;
  recent: Record<string, unknown>[];
  initialSince: string;
  initialUntil: string;
  initialProductId?: string;
}) {
  const { organization } = useAdmin();
  const router = useRouter();
  const products = listProducts();

  const [since, setSince] = useState(initialSince.slice(0, 10));
  const [until, setUntil] = useState(initialUntil.slice(0, 10));
  const [productId, setProductId] = useState(initialProductId ?? "");

  const exportUrl = useMemo(() => {
    const params = new URLSearchParams({ export: "csv", since, until });
    if (productId) params.set("productId", productId);
    return `/api/admin/query-analytics?${params.toString()}`;
  }, [since, until, productId]);

  function applyFilters() {
    const params = new URLSearchParams({ since, until });
    if (productId) params.set("productId", productId);
    router.push(`/admin/documentation-agent/query-analytics?${params.toString()}`);
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        eyebrow={organization.name}
        title="Query analytics"
        description="Server-recorded Ask AI outcomes with date range, latency percentiles, and CSV export."
      />

      <section className="flex flex-wrap items-end gap-3 rounded-lg border border-zinc-200 p-4 text-xs dark:border-zinc-800">
        <label className="flex flex-col gap-1">
          From
          <input
            type="date"
            value={since}
            onChange={(e) => setSince(e.target.value)}
            className="rounded border border-zinc-300 px-2 py-1 dark:border-zinc-600 dark:bg-zinc-900"
          />
        </label>
        <label className="flex flex-col gap-1">
          To
          <input
            type="date"
            value={until}
            onChange={(e) => setUntil(e.target.value)}
            className="rounded border border-zinc-300 px-2 py-1 dark:border-zinc-600 dark:bg-zinc-900"
          />
        </label>
        <label className="flex flex-col gap-1">
          Product
          <select
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
            className="rounded border border-zinc-300 px-2 py-1 dark:border-zinc-600 dark:bg-zinc-900"
          >
            <option value="">All products</option>
            {products.map((p) => (
              <option key={p.productId} value={p.productId}>
                {p.displayLabel}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={applyFilters}
          className="rounded bg-sky-600 px-3 py-1.5 font-semibold text-white"
        >
          Apply filters
        </button>
        <a
          href={exportUrl}
          className="rounded border border-zinc-300 px-3 py-1.5 dark:border-zinc-600"
        >
          Export CSV
        </a>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Logical queries" value={String(summary.totalLogicalQueries)} />
        <MetricCard label="Attempts" value={String(summary.totalAttempts)} />
        <MetricCard label="Answered" value={String(summary.answered)} />
        <MetricCard label="Unanswered" value={String(summary.unanswered)} />
      </div>
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <MetricCard label="Access blocked" value={String(summary.accessBlocked)} />
        <MetricCard label="Credential blocked" value={String(summary.credentialBlocked)} />
        <MetricCard label="Provider errors" value={String(summary.providerError)} />
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
          <p className="text-sm text-zinc-500">No analytics recorded yet.</p>
        ) : (
          <ul className="space-y-2 text-xs">
            {recent.map((row) => (
              <li
                key={String(row.id)}
                className="rounded border border-zinc-200 px-3 py-2 dark:border-zinc-800"
              >
                <span className="font-mono">{String(row.outcome)}</span>
                {" · "}
                {String(row.product_id ?? "—")}
                {" · "}
                {String(row.hostname)}
                {" · "}
                {row.latency_ms != null ? `${row.latency_ms} ms · ` : ""}
                {new Date(String(row.created_at)).toLocaleString()}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

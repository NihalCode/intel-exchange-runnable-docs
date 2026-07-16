"use client";

import { useAdmin } from "@/components/admin/context/AdminContext";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { MetricCard } from "@/components/admin/ui/MetricCard";
import type { QueryAnalyticsSummary } from "@/lib/query-analytics/repository";

export function QueryAnalyticsPage({
  summary,
  recent,
}: {
  summary: QueryAnalyticsSummary;
  recent: Record<string, unknown>[];
}) {
  const { organization } = useAdmin();

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        eyebrow={organization.name}
        title="Query analytics"
        description="Server-recorded Ask AI outcomes (last 30 days)."
      />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Logical queries" value={String(summary.totalLogicalQueries)} />
        <MetricCard label="Attempts" value={String(summary.totalAttempts)} />
        <MetricCard label="Answered" value={String(summary.answered)} />
        <MetricCard label="Unanswered" value={String(summary.unanswered)} />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <MetricCard label="Access blocked" value={String(summary.accessBlocked)} />
        <MetricCard label="Credential blocked" value={String(summary.credentialBlocked)} />
        <MetricCard label="Provider errors" value={String(summary.providerError)} />
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
                {new Date(String(row.created_at)).toLocaleString()}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

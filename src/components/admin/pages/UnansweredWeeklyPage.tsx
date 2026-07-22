"use client";

import { useAdmin } from "@/components/admin/context/AdminContext";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import type { WeeklySnapshotRow } from "@/lib/query-analytics/unanswered-types";

export function UnansweredWeeklyPage({
  rows,
  refreshedAt,
  weeklyEnabled = true,
}: {
  rows: WeeklySnapshotRow[];
  refreshedAt: string;
  /** When false, page remains reachable but export/data stay gated. */
  weeklyEnabled?: boolean;
}) {
  const { organization } = useAdmin();

  return (
    <div
      className="mx-auto max-w-[var(--workbench-max)] space-y-6"
      data-layout="cx-weekly-analytics-workbench"
      data-testid="admin-unanswered-weekly-page"
    >
      <PageHeader
        eyebrow={organization.name}
        title="Unanswered weekly analytics"
        description="Aggregate unanswered review counts by week. CSV export excludes raw query text and IP."
      />
      {!weeklyEnabled ? (
        <div
          className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100"
          data-testid="weekly-analytics-disabled-banner"
          role="status"
        >
          <p className="font-medium">Weekly unanswered analytics is currently off</p>
          <p className="mt-1 text-xs opacity-90">
            Enable <strong>Unanswered query weekly analytics</strong> under Admin → Features, or
            set the matching environment flag for this deployment. Review triage remains available
            on Unanswered queries.
          </p>
        </div>
      ) : null}
      <div className="flex flex-wrap gap-3 text-xs">
        <span className="text-zinc-500">
          Refreshed {new Date(refreshedAt).toLocaleString()}
        </span>
        {weeklyEnabled ? (
          <button
            type="button"
            className="underline-offset-2 hover:underline"
            onClick={() => {
              window.location.assign(
                "/api/admin/unanswered-queries/weekly?format=csv"
              );
            }}
          >
            Download CSV
          </button>
        ) : null}
      </div>
      {!weeklyEnabled ? (
        <p className="text-sm text-zinc-500">Snapshots are hidden while this feature is disabled.</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-zinc-500">
          No weekly snapshots yet. Run <code>npm run analytics:weekly-unanswered</code> or wait
          for the control-plane job.
        </p>
      ) : (
        <div className="overflow-x-auto rounded border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900">
              <tr>
                <th className="px-3 py-2">Week</th>
                <th className="px-3 py-2">Product</th>
                <th className="px-3 py-2">Hostname</th>
                <th className="px-3 py-2">Outcome</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Reviews</th>
                <th className="px-3 py-2">New</th>
                <th className="px-3 py-2">Fixed</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-zinc-100 dark:border-zinc-800">
                  <td className="px-3 py-1.5 font-mono">{row.weekStart}</td>
                  <td className="px-3 py-1.5">{row.productId ?? "—"}</td>
                  <td className="px-3 py-1.5">{row.hostname ?? "—"}</td>
                  <td className="px-3 py-1.5 font-mono">{row.outcome ?? "—"}</td>
                  <td className="px-3 py-1.5">{row.status ?? "—"}</td>
                  <td className="px-3 py-1.5 tabular-nums">{row.reviewCount}</td>
                  <td className="px-3 py-1.5 tabular-nums">{row.newCount}</td>
                  <td className="px-3 py-1.5 tabular-nums">{row.fixedCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

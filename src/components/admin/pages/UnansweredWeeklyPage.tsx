"use client";

import { LiveStatus } from "@/components/atlas";
import { useAdmin } from "@/components/admin/context/AdminContext";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { SignalButton, SignalEmptyState } from "@/components/fabric";
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
      className="mx-auto max-w-[var(--workbench-max)] space-y-5"
      data-layout="sf-weekly-timeline"
      data-testid="admin-unanswered-weekly-page"
    >
      <PageHeader
        eyebrow={organization.name}
        title="Unanswered weekly analytics"
        description="Aggregate unanswered review counts by week. CSV export excludes raw query text and IP."
        actions={
          <LiveStatus
            label={weeklyEnabled ? "Enabled" : "Disabled"}
            tone={weeklyEnabled ? "signal" : "amber"}
          />
        }
      />
      {!weeklyEnabled ? (
        <div
          className="rounded-[var(--radius-sm)] border border-[var(--atlas-amber)] bg-[color-mix(in_srgb,var(--atlas-amber)_12%,transparent)] px-3 py-2 text-sm text-[var(--atlas-text)]"
          data-testid="weekly-analytics-disabled-banner"
          role="status"
        >
          <p className="atlas-micro-label text-[var(--atlas-amber)]">Feature gate</p>
          <p className="mt-1 font-medium">Weekly unanswered analytics is currently off</p>
          <p className="mt-1 text-xs text-[var(--atlas-text-secondary)]">
            Enable Unanswered query weekly analytics under Admin → Features, or set the matching
            environment flag for this deployment. Review triage remains available on Unanswered
            queries.
          </p>
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--atlas-text-muted)]">
          Refreshed {new Date(refreshedAt).toLocaleString()}
        </span>
        {weeklyEnabled ? (
          <SignalButton
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => {
              window.location.assign(
                "/api/admin/unanswered-queries/weekly?format=csv"
              );
            }}
          >
            Download CSV
          </SignalButton>
        ) : null}
      </div>
      {!weeklyEnabled ? (
        <p className="text-sm text-[var(--atlas-text-muted)]">
          Snapshots are hidden while this feature is disabled.
        </p>
      ) : rows.length === 0 ? (
        <SignalEmptyState
          title="No weekly snapshots yet"
          description="Run npm run analytics:weekly-unanswered or wait for the control-plane job."
        />
      ) : (
        <div className="sf-table-wrap overflow-x-auto rounded-[var(--radius-sm)]">
          <table className="w-full text-left text-xs text-[var(--atlas-text)]">
            <thead>
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
                <tr key={row.id} className="border-t border-[var(--atlas-line)]">
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

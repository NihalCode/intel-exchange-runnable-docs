import "server-only";

import { createHash, randomUUID } from "node:crypto";

import { db, ensureMigrations } from "@/lib/db/client";
import { listOrganizations } from "@/lib/enterprise/repository";
import type {
  UnansweredSummary,
  WeeklySnapshotRow,
} from "@/lib/query-analytics/unanswered-types";

export type { UnansweredSummary, WeeklySnapshotRow };

function utcWeekStart(date = new Date()): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day; // Monday start
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

function utcWeekEndExclusive(weekStart: string): string {
  const d = new Date(`${weekStart}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + 7);
  return d.toISOString().slice(0, 10);
}

export async function summarizeUnansweredReviews(
  organizationId: string
): Promise<UnansweredSummary> {
  ensureMigrations();
  const rows = await db.query<{
    status: string;
    outcome: string | null;
    product_id: string | null;
    cnt: number | string;
  }>(
    `SELECT r.status,
            COALESCE(e.outcome, 'unknown') AS outcome,
            e.product_id,
            COUNT(*) AS cnt
     FROM unanswered_query_reviews r
     LEFT JOIN query_analytics_events e ON e.id = r.analytics_event_id
     WHERE r.organization_id = ?
     GROUP BY r.status, COALESCE(e.outcome, 'unknown'), e.product_id`,
    [organizationId]
  );

  const byStatus: Record<string, number> = {};
  const byOutcome: Record<string, number> = {};
  const byProduct: Record<string, number> = {};
  let totalOpen = 0;
  let totalNew = 0;

  for (const row of rows) {
    const count = Number(row.cnt) || 0;
    byStatus[row.status] = (byStatus[row.status] ?? 0) + count;
    const outcome = row.outcome ?? "unknown";
    byOutcome[outcome] = (byOutcome[outcome] ?? 0) + count;
    const product = row.product_id ?? "unknown";
    byProduct[product] = (byProduct[product] ?? 0) + count;
    if (row.status === "NEW") totalNew += count;
    if (row.status !== "FIXED" && row.status !== "ACCEPTED_LIMITATION") {
      totalOpen += count;
    }
  }

  const fingerprint = createHash("sha256")
    .update(JSON.stringify({ byStatus, byOutcome, byProduct }))
    .digest("hex")
    .slice(0, 16);

  return {
    refreshedAt: new Date().toISOString(),
    totalOpen,
    totalNew,
    byStatus,
    byOutcome,
    byProduct,
    fingerprint,
  };
}

export async function buildUnansweredWeeklySnapshots(input?: {
  organizationId?: string;
  weekStart?: string;
  /** When true, compute aggregates but do not DELETE/INSERT snapshots. */
  dryRun?: boolean;
}): Promise<{
  organizations: number;
  rowsUpserted: number;
  dryRun: boolean;
  weekStart: string;
}> {
  ensureMigrations();
  const dryRun = Boolean(input?.dryRun);
  const weekStart = input?.weekStart ?? utcWeekStart();
  const organizations = input?.organizationId
    ? [{ id: input.organizationId }]
    : await listOrganizations();

  let rowsUpserted = 0;
  const now = new Date().toISOString();
  const weekEnd = utcWeekEndExclusive(weekStart);

  for (const org of organizations) {
    if (!dryRun) {
      await db.execute(
        `DELETE FROM unanswered_weekly_snapshots
         WHERE organization_id = ? AND week_start = ?`,
        [org.id, weekStart]
      );
    }

    const aggregates = await db.query<{
      product_id: string | null;
      hostname: string | null;
      outcome: string | null;
      status: string;
      review_count: number | string;
      new_count: number | string;
      fixed_count: number | string;
    }>(
      `SELECT e.product_id,
              e.hostname,
              e.outcome,
              r.status,
              COUNT(*) AS review_count,
              SUM(CASE WHEN r.status = 'NEW' THEN 1 ELSE 0 END) AS new_count,
              SUM(CASE WHEN r.status = 'FIXED' THEN 1 ELSE 0 END) AS fixed_count
       FROM unanswered_query_reviews r
       LEFT JOIN query_analytics_events e ON e.id = r.analytics_event_id
       WHERE r.organization_id = ?
         AND r.created_at >= ?
         AND r.created_at < ?
       GROUP BY e.product_id, e.hostname, e.outcome, r.status`,
      [org.id, weekStart, weekEnd]
    );

    for (const row of aggregates) {
      if (!dryRun) {
        const id = randomUUID();
        await db.execute(
          `INSERT INTO unanswered_weekly_snapshots (
             id, organization_id, week_start, product_id, hostname, outcome, status,
             review_count, new_count, fixed_count, metadata_json, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '{}', ?, ?)`,
          [
            id,
            org.id,
            weekStart,
            row.product_id,
            row.hostname,
            row.outcome,
            row.status,
            Number(row.review_count) || 0,
            Number(row.new_count) || 0,
            Number(row.fixed_count) || 0,
            now,
            now,
          ]
        );
      }
      rowsUpserted += 1;
    }
  }

  return {
    organizations: organizations.length,
    rowsUpserted,
    dryRun,
    weekStart,
  };
}

export async function listWeeklySnapshots(
  organizationId: string,
  limit = 50
): Promise<WeeklySnapshotRow[]> {
  ensureMigrations();
  const rows = await db.query<Record<string, unknown>>(
    `SELECT id, week_start, product_id, hostname, outcome, status,
            review_count, new_count, fixed_count, created_at, updated_at
     FROM unanswered_weekly_snapshots
     WHERE organization_id = ?
     ORDER BY week_start DESC, updated_at DESC
     LIMIT ?`,
    [organizationId, Math.min(Math.max(limit, 1), 200)]
  );
  return rows.map((row) => ({
    id: String(row.id),
    weekStart: String(row.week_start),
    productId: row.product_id ? String(row.product_id) : null,
    hostname: row.hostname ? String(row.hostname) : null,
    outcome: row.outcome ? String(row.outcome) : null,
    status: row.status ? String(row.status) : null,
    reviewCount: Number(row.review_count) || 0,
    newCount: Number(row.new_count) || 0,
    fixedCount: Number(row.fixed_count) || 0,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }));
}

export function weeklySnapshotsToCsv(rows: WeeklySnapshotRow[]): string {
  const header = [
    "week_start",
    "product_id",
    "hostname",
    "outcome",
    "status",
    "review_count",
    "new_count",
    "fixed_count",
  ];
  const lines = [header.join(",")];
  for (const row of rows) {
    lines.push(
      [
        row.weekStart,
        row.productId ?? "",
        row.hostname ?? "",
        row.outcome ?? "",
        row.status ?? "",
        String(row.reviewCount),
        String(row.newCount),
        String(row.fixedCount),
      ]
        .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
        .join(",")
    );
  }
  return lines.join("\n");
}

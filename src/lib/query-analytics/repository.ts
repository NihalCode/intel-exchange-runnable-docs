import "server-only";

import { randomUUID } from "node:crypto";

import { db } from "@/lib/db/client";
import type { QueryOutcome } from "@/lib/agent/query-outcome";
import type { ProductKey } from "@/lib/products/registry";
import {
  UNANSWERED_QUERY_REVIEW_STATUSES,
  type UnansweredQueryReviewStatus,
} from "@/lib/domains/types";

/** Static INSERT — all values bound. */
const INSERT_ANALYTICS_EVENT_SQL = `
INSERT INTO query_analytics_events (
  id, organization_id, user_id, conversation_id, turn_id, logical_query_id, attempt_id,
  hostname, product_id, collection_id, intent, outcome, retrieval_result_count,
  citation_count, latency_ms, request_id, trace_id, model_version, prompt_version,
  index_version, metadata_json, created_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

const SUMMARIZE_ANALYTICS_SQL = `
SELECT outcome,
  COUNT(DISTINCT logical_query_id) AS logical_count,
  COUNT(*) AS attempt_count
FROM query_analytics_events
WHERE organization_id = ? AND created_at >= ?
GROUP BY outcome
`;

const LIST_RECENT_ANALYTICS_SQL = `
SELECT id, logical_query_id, attempt_id, hostname, product_id, outcome, latency_ms, created_at
FROM query_analytics_events
WHERE organization_id = ?
ORDER BY created_at DESC
LIMIT ?
`;

const SELECT_REVIEW_BY_EVENT_SQL = `
SELECT id FROM unanswered_query_reviews
WHERE organization_id = ? AND analytics_event_id = ?
`;

const INSERT_REVIEW_SQL = `
INSERT INTO unanswered_query_reviews (
  id, organization_id, analytics_event_id, status, version, created_at, updated_at
) VALUES (?, ?, ?, 'NEW', 1, ?, ?)
`;

const LIST_REVIEWS_SQL = `
SELECT r.id, r.analytics_event_id, r.status, r.internal_note, r.created_at, r.updated_at,
       e.outcome, e.hostname, e.product_id
FROM unanswered_query_reviews r
LEFT JOIN query_analytics_events e ON e.id = r.analytics_event_id
WHERE r.organization_id = ?
ORDER BY r.updated_at DESC
LIMIT ?
`;

const SELECT_REVIEW_FOR_UPDATE_SQL = `
SELECT id, version FROM unanswered_query_reviews
WHERE organization_id = ? AND id = ?
`;

const UPDATE_REVIEW_SQL = `
UPDATE unanswered_query_reviews
SET status = ?, internal_note = ?, updated_at = ?, version = version + 1
WHERE organization_id = ? AND id = ? AND version = ?
`;

/**
 * Filtered analytics WHERE — fully static. Optional filters use
 * `? IS NULL OR col = ?` so no clause strings are interpolated.
 */
const FILTERED_ANALYTICS_WHERE_SQL = `
organization_id = ?
AND created_at >= ?
AND (? IS NULL OR created_at <= ?)
AND (? IS NULL OR product_id = ?)
AND (? IS NULL OR hostname = ?)
AND (? IS NULL OR outcome = ?)
`;

const SUMMARIZE_FILTERED_SQL =
  "SELECT outcome,\n" +
  "  COUNT(DISTINCT logical_query_id) AS logical_count,\n" +
  "  COUNT(*) AS attempt_count\n" +
  "FROM query_analytics_events\n" +
  "WHERE " +
  FILTERED_ANALYTICS_WHERE_SQL +
  "\nGROUP BY outcome";

const LATENCY_FILTERED_SQL =
  "SELECT latency_ms FROM query_analytics_events\n" +
  "WHERE " +
  FILTERED_ANALYTICS_WHERE_SQL +
  " AND latency_ms IS NOT NULL\n" +
  "ORDER BY latency_ms ASC";

const LIST_FILTERED_SQL =
  "SELECT id, logical_query_id, attempt_id, hostname, product_id, outcome, latency_ms, created_at\n" +
  "FROM query_analytics_events\n" +
  "WHERE " +
  FILTERED_ANALYTICS_WHERE_SQL +
  "\nORDER BY created_at DESC\n" +
  "LIMIT ?";

const EXPORT_FILTERED_SQL =
  "SELECT logical_query_id, attempt_id, hostname, product_id, outcome, latency_ms, created_at\n" +
  "FROM query_analytics_events\n" +
  "WHERE " +
  FILTERED_ANALYTICS_WHERE_SQL +
  "\nORDER BY created_at DESC";

const REVIEW_STATUS_SET = new Set<string>(UNANSWERED_QUERY_REVIEW_STATUSES);

function assertReviewStatus(status: string): UnansweredQueryReviewStatus {
  if (!REVIEW_STATUS_SET.has(status)) {
    throw new Error("Invalid unanswered query review status");
  }
  return status as UnansweredQueryReviewStatus;
}

function filteredParams(
  organizationId: string,
  filters: QueryAnalyticsFilters
): unknown[] {
  const until = filters.untilIso ?? null;
  const productId = filters.productId ?? null;
  const hostname = filters.hostname ?? null;
  const outcome = filters.outcome ?? null;
  return [
    organizationId,
    filters.sinceIso,
    until,
    until,
    productId,
    productId,
    hostname,
    hostname,
    outcome,
    outcome,
  ];
}

export interface QueryAnalyticsEventInput {
  organizationId: string;
  userId?: string | null;
  conversationId?: string | null;
  turnId?: string | null;
  logicalQueryId: string;
  attemptId?: string;
  hostname: string;
  productId?: ProductKey | null;
  collectionId?: string | null;
  intent?: string | null;
  outcome: QueryOutcome;
  retrievalResultCount?: number | null;
  citationCount?: number | null;
  latencyMs?: number | null;
  requestId?: string | null;
  traceId?: string | null;
  modelVersion?: string | null;
  promptVersion?: string | null;
  indexVersion?: string | null;
  metadata?: Record<string, unknown>;
}

export async function recordQueryAnalyticsEvent(
  input: QueryAnalyticsEventInput
): Promise<string> {
  const id = randomUUID();
  const attemptId = input.attemptId ?? randomUUID();
  const now = new Date().toISOString();
  await db.execute(INSERT_ANALYTICS_EVENT_SQL, [
    id,
    input.organizationId,
    input.userId ?? null,
    input.conversationId ?? null,
    input.turnId ?? null,
    input.logicalQueryId,
    attemptId,
    input.hostname,
    input.productId ?? null,
    input.collectionId ?? null,
    input.intent ?? null,
    input.outcome,
    input.retrievalResultCount ?? null,
    input.citationCount ?? null,
    input.latencyMs ?? null,
    input.requestId ?? null,
    input.traceId ?? null,
    input.modelVersion ?? null,
    input.promptVersion ?? null,
    input.indexVersion ?? null,
    JSON.stringify(input.metadata ?? {}),
    now,
  ]);
  return id;
}

export interface QueryAnalyticsSummary {
  totalLogicalQueries: number;
  totalAttempts: number;
  answered: number;
  unanswered: number;
  accessBlocked: number;
  credentialBlocked: number;
  providerError: number;
}

function emptySummary(): QueryAnalyticsSummary {
  return {
    totalLogicalQueries: 0,
    totalAttempts: 0,
    answered: 0,
    unanswered: 0,
    accessBlocked: 0,
    credentialBlocked: 0,
    providerError: 0,
  };
}

function accumulateOutcome(
  summary: QueryAnalyticsSummary,
  outcome: string,
  logicalCount: number,
  attemptCount: number
): void {
  summary.totalLogicalQueries += logicalCount;
  summary.totalAttempts += attemptCount;
  if (outcome === "answered" || outcome === "partially_answered") {
    summary.answered += logicalCount;
  }
  if (
    outcome === "no_verified_solution" ||
    outcome === "no_results" ||
    outcome === "partially_answered"
  ) {
    summary.unanswered += logicalCount;
  }
  if (outcome === "access_blocked") summary.accessBlocked += logicalCount;
  if (outcome === "credential_blocked") summary.credentialBlocked += logicalCount;
  if (outcome === "provider_error" || outcome === "system_error") {
    summary.providerError += logicalCount;
  }
}

export async function summarizeQueryAnalytics(
  organizationId: string,
  sinceIso: string
): Promise<QueryAnalyticsSummary> {
  const rows = await db.query<{
    outcome: string;
    logical_count: number;
    attempt_count: number;
  }>(SUMMARIZE_ANALYTICS_SQL, [organizationId, sinceIso]);

  const summary = emptySummary();
  for (const row of rows) {
    accumulateOutcome(
      summary,
      row.outcome,
      Number(row.logical_count),
      Number(row.attempt_count)
    );
  }
  return summary;
}

export async function listRecentQueryAnalytics(
  organizationId: string,
  limit = 50
): Promise<Record<string, unknown>[]> {
  return db.query(LIST_RECENT_ANALYTICS_SQL, [organizationId, limit]);
}

export async function ensureUnansweredReviewForEvent(
  organizationId: string,
  analyticsEventId: string
): Promise<void> {
  const existing = await db.queryOne(SELECT_REVIEW_BY_EVENT_SQL, [
    organizationId,
    analyticsEventId,
  ]);
  if (existing) return;
  const now = new Date().toISOString();
  await db.execute(INSERT_REVIEW_SQL, [
    randomUUID(),
    organizationId,
    analyticsEventId,
    now,
    now,
  ]);
}

export interface UnansweredQueryReviewRow {
  id: string;
  analyticsEventId: string;
  status: UnansweredQueryReviewStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  outcome: string | null;
  hostname: string | null;
  productId: string | null;
}

export async function listUnansweredQueryReviews(
  organizationId: string,
  limit = 50
): Promise<UnansweredQueryReviewRow[]> {
  const rows = await db.query<Record<string, unknown>>(LIST_REVIEWS_SQL, [
    organizationId,
    limit,
  ]);
  return rows.map((row) => ({
    id: String(row.id),
    analyticsEventId: String(row.analytics_event_id),
    status: String(row.status) as UnansweredQueryReviewStatus,
    notes: row.internal_note == null ? null : String(row.internal_note),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    outcome: row.outcome == null ? null : String(row.outcome),
    hostname: row.hostname == null ? null : String(row.hostname),
    productId: row.product_id == null ? null : String(row.product_id),
  }));
}

export async function updateUnansweredQueryReview(input: {
  organizationId: string;
  id: string;
  status: UnansweredQueryReviewStatus;
  notes?: string | null;
}): Promise<boolean> {
  const status = assertReviewStatus(input.status);
  const existing = await db.queryOne<{ id: string; version: number }>(
    SELECT_REVIEW_FOR_UPDATE_SQL,
    [input.organizationId, input.id]
  );
  if (!existing) return false;
  const now = new Date().toISOString();
  await db.execute(UPDATE_REVIEW_SQL, [
    status,
    input.notes ?? null,
    now,
    input.organizationId,
    input.id,
    Number(existing.version),
  ]);
  return true;
}

export interface QueryAnalyticsFilters {
  sinceIso: string;
  untilIso?: string;
  productId?: ProductKey | null;
  hostname?: string | null;
  outcome?: string | null;
}

export interface QueryAnalyticsMetrics extends QueryAnalyticsSummary {
  p50LatencyMs: number | null;
  p95LatencyMs: number | null;
  avgLatencyMs: number | null;
}

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, index))] ?? null;
}

export async function summarizeQueryAnalyticsFiltered(
  organizationId: string,
  filters: QueryAnalyticsFilters
): Promise<QueryAnalyticsMetrics> {
  const params = filteredParams(organizationId, filters);
  const rows = await db.query<{
    outcome: string;
    logical_count: number;
    attempt_count: number;
  }>(SUMMARIZE_FILTERED_SQL, params);

  const summary: QueryAnalyticsMetrics = {
    ...emptySummary(),
    p50LatencyMs: null,
    p95LatencyMs: null,
    avgLatencyMs: null,
  };

  for (const row of rows) {
    accumulateOutcome(
      summary,
      row.outcome,
      Number(row.logical_count),
      Number(row.attempt_count)
    );
  }

  const latencyRows = await db.query<{ latency_ms: number | null }>(
    LATENCY_FILTERED_SQL,
    params
  );
  const latencies = latencyRows
    .map((r) => Number(r.latency_ms))
    .filter((n) => Number.isFinite(n));
  if (latencies.length > 0) {
    summary.p50LatencyMs = percentile(latencies, 50);
    summary.p95LatencyMs = percentile(latencies, 95);
    summary.avgLatencyMs =
      latencies.reduce((sum, value) => sum + value, 0) / latencies.length;
  }

  return summary;
}

export async function listQueryAnalyticsEvents(
  organizationId: string,
  filters: QueryAnalyticsFilters,
  limit = 100
): Promise<Record<string, unknown>[]> {
  return db.query(LIST_FILTERED_SQL, [
    ...filteredParams(organizationId, filters),
    limit,
  ]);
}

export async function exportQueryAnalyticsCsv(
  organizationId: string,
  filters: QueryAnalyticsFilters
): Promise<string> {
  const rows = await db.query<Record<string, unknown>>(
    EXPORT_FILTERED_SQL,
    filteredParams(organizationId, filters)
  );
  const header = "logical_query_id,attempt_id,hostname,product_id,outcome,latency_ms,created_at";
  const lines = rows.map((row) =>
    [
      row.logical_query_id,
      row.attempt_id,
      row.hostname,
      row.product_id ?? "",
      row.outcome,
      row.latency_ms ?? "",
      row.created_at,
    ]
      .map((value) => `"${String(value).replace(/"/g, '""')}"`)
      .join(",")
  );
  return [header, ...lines].join("\n");
}

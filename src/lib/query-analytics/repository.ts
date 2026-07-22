import "server-only";

import { randomUUID } from "node:crypto";

import {
  countsTowardLogicalQueryMetrics,
  isAnswerQualityOutcome,
  isUnansweredOutcome,
  type QueryOutcome,
} from "@/lib/agent/query-outcome";
import { db, ensureMigrations } from "@/lib/db/client";
import {
  decryptSecret,
  type EncryptedSecret,
} from "@/lib/documentation-credentials/encryption";
import type { ProductKey } from "@/lib/products/registry";
import {
  UNANSWERED_QUERY_REVIEW_STATUSES,
  type UnansweredQueryReviewStatus,
} from "@/lib/domains/types";
import {
  classifyDecryptError,
  type SensitiveFieldStatus,
} from "@/lib/query-analytics/reveal-ui";

/** Static INSERT — all values bound. Idempotent via unique (org, attempt_id). */
const UPSERT_ANALYTICS_EVENT_SQL = `
INSERT INTO query_analytics_events (
  id, organization_id, user_id, conversation_id, turn_id, logical_query_id, attempt_id,
  hostname, product_id, collection_id, intent, outcome, retrieval_result_count,
  citation_count, latency_ms, request_id, trace_id, model_version, prompt_version,
  index_version, metadata_json, created_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(organization_id, attempt_id) DO UPDATE SET
  user_id = excluded.user_id,
  conversation_id = excluded.conversation_id,
  turn_id = excluded.turn_id,
  logical_query_id = excluded.logical_query_id,
  hostname = excluded.hostname,
  product_id = excluded.product_id,
  collection_id = excluded.collection_id,
  intent = excluded.intent,
  outcome = excluded.outcome,
  retrieval_result_count = excluded.retrieval_result_count,
  citation_count = excluded.citation_count,
  latency_ms = excluded.latency_ms,
  request_id = excluded.request_id,
  trace_id = excluded.trace_id,
  model_version = excluded.model_version,
  prompt_version = excluded.prompt_version,
  index_version = excluded.index_version,
  metadata_json = excluded.metadata_json
`;

const SELECT_EVENT_ID_BY_ATTEMPT_SQL = `
SELECT id FROM query_analytics_events
WHERE organization_id = ? AND attempt_id = ?
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
       r.sanitized_topic, r.query_fingerprint, r.logical_query_id,
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

const RESOLVE_OPEN_REVIEWS_SQL = `
UPDATE unanswered_query_reviews
SET status = 'FIXED',
    resolved_by_logical_query_id = ?,
    resolution_reference = ?,
    updated_at = ?,
    version = version + 1
WHERE organization_id = ?
  AND logical_query_id = ?
  AND status NOT IN ('FIXED', 'ACCEPTED_LIMITATION')
`;

/**
 * Filtered analytics WHERE — fully static. Optional text filters use
 * `CAST(? AS TEXT) IS NULL OR col = CAST(? AS TEXT)` so no clause strings
 * are interpolated.
 *
 * CAST is required for Postgres: bare `? IS NULL` with a JS `null` binding
 * raises 42P18 ("could not determine data type of parameter $N"). SQLite
 * accepts the same CAST form.
 *
 * Date bounds are always concrete ISO strings (never null) so Postgres can
 * compare `created_at` (timestamptz) without casting to text.
 */
const FILTERED_ANALYTICS_WHERE_SQL = `
organization_id = ?
AND created_at >= ?
AND created_at <= ?
AND (CAST(? AS TEXT) IS NULL OR product_id = CAST(? AS TEXT))
AND (CAST(? AS TEXT) IS NULL OR hostname = CAST(? AS TEXT))
AND (CAST(? AS TEXT) IS NULL OR outcome = CAST(? AS TEXT))
`;

/** Open-ended upper bound when callers omit untilIso. */
const FILTER_UNTIL_OPEN_ENDED = "9999-12-31T23:59:59.999Z";

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
  "\nORDER BY created_at DESC\n" +
  "LIMIT ?";

const EXPORT_SENSITIVE_SQL = `
SELECT e.logical_query_id, e.attempt_id, e.hostname, e.product_id, e.outcome,
  e.latency_ms, e.created_at, r.sanitized_topic, r.query_fingerprint,
  r.query_ciphertext, r.query_iv, r.query_tag, r.ip_ciphertext, r.ip_iv, r.ip_tag
FROM query_analytics_events e
LEFT JOIN unanswered_query_reviews r
  ON r.analytics_event_id = e.id AND r.organization_id = e.organization_id
WHERE e.organization_id = ?
AND e.created_at >= ?
AND e.created_at <= ?
AND (CAST(? AS TEXT) IS NULL OR e.product_id = CAST(? AS TEXT))
AND (CAST(? AS TEXT) IS NULL OR e.hostname = CAST(? AS TEXT))
AND (CAST(? AS TEXT) IS NULL OR e.outcome = CAST(? AS TEXT))
ORDER BY e.created_at DESC
LIMIT ?
`;

export const CSV_EXPORT_ROW_LIMIT = 10_000;

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
  const until = filters.untilIso ?? FILTER_UNTIL_OPEN_ENDED;
  const productId = filters.productId ?? null;
  const hostname = filters.hostname ?? null;
  const outcome = filters.outcome ?? null;
  return [
    organizationId,
    filters.sinceIso,
    until,
    productId,
    productId,
    hostname,
    hostname,
    outcome,
    outcome,
  ];
}

/** Plain-object rows safe to pass from RSC → Client Components (no Date instances). */
export interface QueryAnalyticsEventListItem {
  id: string;
  logicalQueryId: string;
  attemptId: string;
  hostname: string;
  productId: string | null;
  outcome: string;
  latencyMs: number | null;
  createdAt: string;
}

function asIsoTimestamp(value: unknown): string {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? "" : value.toISOString();
  }
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
    return String(value);
  }
  return value == null ? "" : String(value);
}

export function serializeQueryAnalyticsEvents(
  rows: Record<string, unknown>[]
): QueryAnalyticsEventListItem[] {
  return rows.map((row) => ({
    id: String(row.id ?? ""),
    logicalQueryId: String(row.logical_query_id ?? ""),
    attemptId: String(row.attempt_id ?? ""),
    hostname: String(row.hostname ?? ""),
    productId: row.product_id == null ? null : String(row.product_id),
    outcome: String(row.outcome ?? ""),
    latencyMs:
      row.latency_ms == null || row.latency_ms === ""
        ? null
        : Number(row.latency_ms),
    createdAt: asIsoTimestamp(row.created_at),
  }));
}

/** Escape CSV cell against formula injection (=, +, -, @, tab, CR). */
export function escapeCsvCell(value: unknown): string {
  let text = String(value ?? "");
  if (/^[=+\-@\t\r]/.test(text)) {
    text = `'${text}`;
  }
  return `"${text.replace(/"/g, '""')}"`;
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

/**
 * Idempotent projection upsert keyed by (organization_id, attempt_id).
 * Requires migration 010 unique index.
 */
export async function upsertQueryAnalyticsEvent(
  input: QueryAnalyticsEventInput
): Promise<string> {
  ensureMigrations();
  const attemptId = input.attemptId ?? randomUUID();
  const existing = await db.queryOne<{ id: string }>(SELECT_EVENT_ID_BY_ATTEMPT_SQL, [
    input.organizationId,
    attemptId,
  ]);
  const id = existing?.id ?? randomUUID();
  const now = new Date().toISOString();
  await db.execute(UPSERT_ANALYTICS_EVENT_SQL, [
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
  const row = await db.queryOne<{ id: string }>(SELECT_EVENT_ID_BY_ATTEMPT_SQL, [
    input.organizationId,
    attemptId,
  ]);
  return row?.id ?? id;
}

/** @deprecated Prefer upsertQueryAnalyticsEvent — kept for test compatibility. */
export async function recordQueryAnalyticsEvent(
  input: QueryAnalyticsEventInput
): Promise<string> {
  return upsertQueryAnalyticsEvent(input);
}

export interface QueryAnalyticsSummary {
  totalLogicalQueries: number;
  totalAttempts: number;
  answered: number;
  partiallyAnswered: number;
  unanswered: number;
  accessBlocked: number;
  credentialBlocked: number;
  providerError: number;
  clarificationRequired: number;
  /** answered + partially_answered + no_verified_solution + no_results + clarification_required */
  answerQualityDenominator: number;
}

function emptySummary(): QueryAnalyticsSummary {
  return {
    totalLogicalQueries: 0,
    totalAttempts: 0,
    answered: 0,
    partiallyAnswered: 0,
    unanswered: 0,
    accessBlocked: 0,
    credentialBlocked: 0,
    providerError: 0,
    clarificationRequired: 0,
    answerQualityDenominator: 0,
  };
}

function accumulateOutcome(
  summary: QueryAnalyticsSummary,
  outcome: string,
  logicalCount: number,
  attemptCount: number
): void {
  if (countsTowardLogicalQueryMetrics(outcome)) {
    summary.totalLogicalQueries += logicalCount;
  }
  summary.totalAttempts += attemptCount;

  if (outcome === "answered") {
    summary.answered += logicalCount;
  }
  if (outcome === "partially_answered") {
    summary.partiallyAnswered += logicalCount;
  }
  if (isUnansweredOutcome(outcome as QueryOutcome)) {
    summary.unanswered += logicalCount;
  }
  if (outcome === "clarification_required") {
    summary.clarificationRequired += logicalCount;
  }
  if (outcome === "access_blocked") summary.accessBlocked += logicalCount;
  if (outcome === "credential_blocked") summary.credentialBlocked += logicalCount;
  if (outcome === "provider_error" || outcome === "system_error") {
    summary.providerError += logicalCount;
  }
  if (isAnswerQualityOutcome(outcome)) {
    summary.answerQualityDenominator += logicalCount;
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

/**
 * Mark prior unanswered reviews for this logical query as FIXED/superseded
 * without deleting history (successful retry path).
 */
export async function resolveUnansweredReviewsForLogicalQuery(input: {
  organizationId: string;
  logicalQueryId: string;
  resolvedByLogicalQueryId: string;
}): Promise<void> {
  ensureMigrations();
  const now = new Date().toISOString();
  await db.execute(RESOLVE_OPEN_REVIEWS_SQL, [
    input.resolvedByLogicalQueryId,
    `superseded_by:${input.resolvedByLogicalQueryId}`,
    now,
    input.organizationId,
    input.logicalQueryId,
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
  sanitizedTopic?: string | null;
  queryFingerprint?: string | null;
  logicalQueryId?: string | null;
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
    sanitizedTopic:
      row.sanitized_topic == null ? null : String(row.sanitized_topic),
    queryFingerprint:
      row.query_fingerprint == null ? null : String(row.query_fingerprint),
    logicalQueryId:
      row.logical_query_id == null ? null : String(row.logical_query_id),
  }));
}

export async function getUnansweredReviewSensitive(input: {
  organizationId: string;
  reviewId: string;
}): Promise<{
  queryText: string | null;
  clientIp: string | null;
  queryStatus: SensitiveFieldStatus;
  ipStatus: SensitiveFieldStatus;
} | null> {
  ensureMigrations();
  const row = await db.queryOne<Record<string, unknown>>(
    `SELECT logical_query_id, query_ciphertext, query_iv, query_tag,
            ip_ciphertext, ip_iv, ip_tag
     FROM unanswered_query_reviews
     WHERE organization_id = ? AND id = ?`,
    [input.organizationId, input.reviewId]
  );
  if (!row) return null;

  const logicalQueryId = String(row.logical_query_id ?? "");
  const aad = `unanswered:${input.organizationId}:${logicalQueryId}`;
  let queryText: string | null = null;
  let clientIp: string | null = null;
  let queryStatus: SensitiveFieldStatus = "not_captured";
  let ipStatus: SensitiveFieldStatus = "not_captured";

  if (row.query_ciphertext && row.query_iv && row.query_tag) {
    const enc: EncryptedSecret = {
      ciphertext: String(row.query_ciphertext),
      iv: String(row.query_iv),
      tag: String(row.query_tag),
    };
    try {
      queryText = decryptSecret(enc, aad);
      queryStatus = "ok";
    } catch (error) {
      queryText = null;
      queryStatus = classifyDecryptError(error);
    }
  }
  if (row.ip_ciphertext && row.ip_iv && row.ip_tag) {
    const enc: EncryptedSecret = {
      ciphertext: String(row.ip_ciphertext),
      iv: String(row.ip_iv),
      tag: String(row.ip_tag),
    };
    try {
      clientIp = decryptSecret(enc, aad);
      ipStatus = "ok";
    } catch (error) {
      clientIp = null;
      ipStatus = classifyDecryptError(error);
    }
  }
  return { queryText, clientIp, queryStatus, ipStatus };
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
): Promise<QueryAnalyticsEventListItem[]> {
  const rows = await db.query<Record<string, unknown>>(LIST_FILTERED_SQL, [
    ...filteredParams(organizationId, filters),
    limit,
  ]);
  return serializeQueryAnalyticsEvents(rows);
}

/** Empty metrics for degraded admin UI when analytics queries fail. */
export function emptyQueryAnalyticsMetrics(): QueryAnalyticsMetrics {
  return {
    ...emptySummary(),
    p50LatencyMs: null,
    p95LatencyMs: null,
    avgLatencyMs: null,
  };
}

export async function exportQueryAnalyticsCsv(
  organizationId: string,
  filters: QueryAnalyticsFilters,
  options?: { timezone?: string; sensitive?: boolean; rowLimit?: number }
): Promise<string> {
  const limit = Math.min(
    Math.max(options?.rowLimit ?? CSV_EXPORT_ROW_LIMIT, 1),
    CSV_EXPORT_ROW_LIMIT
  );
  const timezone = options?.timezone ?? "UTC";
  const generatedAt = new Date().toISOString();

  if (options?.sensitive) {
    const rows = await db.query<Record<string, unknown>>(EXPORT_SENSITIVE_SQL, [
      ...filteredParams(organizationId, filters),
      limit,
    ]);
    const header =
      "logical_query_id,attempt_id,hostname,product_id,outcome,latency_ms,created_at,sanitized_topic,query_fingerprint,query_text,client_ip";
    const lines = rows.map((row) => {
      let queryText = "";
      let clientIp = "";
      const logicalQueryId = String(row.logical_query_id ?? "");
      const aad = `unanswered:${organizationId}:${logicalQueryId}`;
      if (row.query_ciphertext && row.query_iv && row.query_tag) {
        try {
          queryText = decryptSecret(
            {
              ciphertext: String(row.query_ciphertext),
              iv: String(row.query_iv),
              tag: String(row.query_tag),
            },
            aad
          );
        } catch {
          queryText = "";
        }
      }
      if (row.ip_ciphertext && row.ip_iv && row.ip_tag) {
        try {
          clientIp = decryptSecret(
            {
              ciphertext: String(row.ip_ciphertext),
              iv: String(row.ip_iv),
              tag: String(row.ip_tag),
            },
            aad
          );
        } catch {
          clientIp = "";
        }
      }
      return [
        row.logical_query_id,
        row.attempt_id,
        row.hostname,
        row.product_id ?? "",
        row.outcome,
        row.latency_ms ?? "",
        row.created_at,
        row.sanitized_topic ?? "",
        row.query_fingerprint ?? "",
        queryText,
        clientIp,
      ]
        .map(escapeCsvCell)
        .join(",");
    });
    return [
      `# generated_at=${generatedAt}`,
      `# timezone=${timezone}`,
      `# row_limit=${limit}`,
      `# sensitive=true`,
      header,
      ...lines,
    ].join("\n");
  }

  const rows = await db.query<Record<string, unknown>>(EXPORT_FILTERED_SQL, [
    ...filteredParams(organizationId, filters),
    limit,
  ]);
  const header =
    "logical_query_id,attempt_id,hostname,product_id,outcome,latency_ms,created_at";
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
      .map(escapeCsvCell)
      .join(",")
  );
  return [
    `# generated_at=${generatedAt}`,
    `# timezone=${timezone}`,
    `# row_limit=${limit}`,
    header,
    ...lines,
  ].join("\n");
}

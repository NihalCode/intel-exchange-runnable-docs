import "server-only";

import { randomUUID } from "node:crypto";

import { db } from "@/lib/db/client";
import type { QueryOutcome } from "@/lib/agent/query-outcome";
import type { ProductKey } from "@/lib/products/registry";

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
  await db.execute(
    `INSERT INTO query_analytics_events (
      id, organization_id, user_id, conversation_id, turn_id, logical_query_id, attempt_id,
      hostname, product_id, collection_id, intent, outcome, retrieval_result_count,
      citation_count, latency_ms, request_id, trace_id, model_version, prompt_version,
      index_version, metadata_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
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
    ]
  );
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

export async function summarizeQueryAnalytics(
  organizationId: string,
  sinceIso: string
): Promise<QueryAnalyticsSummary> {
  const rows = await db.query<{
    outcome: string;
    logical_count: number;
    attempt_count: number;
  }>(
    `SELECT outcome,
      COUNT(DISTINCT logical_query_id) AS logical_count,
      COUNT(*) AS attempt_count
     FROM query_analytics_events
     WHERE organization_id = ? AND created_at >= ?
     GROUP BY outcome`,
    [organizationId, sinceIso]
  );

  const summary: QueryAnalyticsSummary = {
    totalLogicalQueries: 0,
    totalAttempts: 0,
    answered: 0,
    unanswered: 0,
    accessBlocked: 0,
    credentialBlocked: 0,
    providerError: 0,
  };

  for (const row of rows) {
    summary.totalLogicalQueries += Number(row.logical_count);
    summary.totalAttempts += Number(row.attempt_count);
    if (row.outcome === "answered" || row.outcome === "partially_answered") {
      summary.answered += Number(row.logical_count);
    }
    if (
      row.outcome === "no_verified_solution" ||
      row.outcome === "no_results" ||
      row.outcome === "partially_answered"
    ) {
      summary.unanswered += Number(row.logical_count);
    }
    if (row.outcome === "access_blocked") summary.accessBlocked += Number(row.logical_count);
    if (row.outcome === "credential_blocked") {
      summary.credentialBlocked += Number(row.logical_count);
    }
    if (row.outcome === "provider_error" || row.outcome === "system_error") {
      summary.providerError += Number(row.logical_count);
    }
  }

  return summary;
}

export async function listRecentQueryAnalytics(
  organizationId: string,
  limit = 50
): Promise<Record<string, unknown>[]> {
  return db.query(
    `SELECT id, logical_query_id, attempt_id, hostname, product_id, outcome, latency_ms, created_at
     FROM query_analytics_events
     WHERE organization_id = ?
     ORDER BY created_at DESC
     LIMIT ?`,
    [organizationId, limit]
  );
}

export async function ensureUnansweredReviewForEvent(
  organizationId: string,
  analyticsEventId: string
): Promise<void> {
  const existing = await db.queryOne(
    `SELECT id FROM unanswered_query_reviews WHERE organization_id = ? AND analytics_event_id = ?`,
    [organizationId, analyticsEventId]
  );
  if (existing) return;
  const now = new Date().toISOString();
  await db.execute(
    `INSERT INTO unanswered_query_reviews (
      id, organization_id, analytics_event_id, status, version, created_at, updated_at
    ) VALUES (?, ?, ?, 'open', 1, ?, ?)`,
    [randomUUID(), organizationId, analyticsEventId, now, now]
  );
}

export interface UnansweredQueryReviewRow {
  id: string;
  analyticsEventId: string;
  status: string;
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
  const rows = await db.query<Record<string, unknown>>(
    `SELECT r.id, r.analytics_event_id, r.status, r.notes, r.created_at, r.updated_at,
            e.outcome, e.hostname, e.product_id
     FROM unanswered_query_reviews r
     LEFT JOIN query_analytics_events e ON e.id = r.analytics_event_id
     WHERE r.organization_id = ?
     ORDER BY r.updated_at DESC
     LIMIT ?`,
    [organizationId, limit]
  );
  return rows.map((row) => ({
    id: String(row.id),
    analyticsEventId: String(row.analytics_event_id),
    status: String(row.status),
    notes: row.notes == null ? null : String(row.notes),
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
  status: "open" | "in_review" | "resolved" | "dismissed";
  notes?: string | null;
}): Promise<boolean> {
  const existing = await db.queryOne(
    `SELECT id FROM unanswered_query_reviews WHERE organization_id = ? AND id = ?`,
    [input.organizationId, input.id]
  );
  if (!existing) return false;
  const now = new Date().toISOString();
  await db.execute(
    `UPDATE unanswered_query_reviews
     SET status = ?, notes = ?, updated_at = ?, version = version + 1
     WHERE organization_id = ? AND id = ?`,
    [input.status, input.notes ?? null, now, input.organizationId, input.id]
  );
  return true;
}

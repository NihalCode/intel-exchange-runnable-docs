import "server-only";

import { createHash, randomUUID } from "node:crypto";

import { db, ensureMigrations } from "@/lib/db/client";
import { appendEnterpriseAuditEvent } from "@/lib/enterprise/audit";

export type AnalyticsOutboxStatus =
  | "pending"
  | "processing"
  | "completed"
  | "dead_letter";

export type AnalyticsOutboxEventType =
  | "materialize_attempt"
  | "record_cancellation"
  | "replay";

const MAX_RETRIES = 8;
const BASE_DELAY_MS = 5_000;

export interface AnalyticsOutboxPayload {
  eventType: AnalyticsOutboxEventType;
  /** Opaque JSON payload consumed by the materializer. */
  body: Record<string, unknown>;
}

export interface AnalyticsOutboxRow {
  id: string;
  organizationId: string;
  eventType: string;
  payload: Record<string, unknown>;
  status: AnalyticsOutboxStatus;
  retryCount: number;
  lastErrorCode: string | null;
  nextRetryAt: string | null;
  createdAt: string;
  updatedAt: string;
}

function nextRetryIso(retryCount: number): string {
  const delay = Math.min(BASE_DELAY_MS * 2 ** retryCount, 60 * 60 * 1000);
  return new Date(Date.now() + delay).toISOString();
}

function parsePayload(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  try {
    const parsed = JSON.parse(String(raw ?? "{}"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export async function enqueueAnalyticsOutbox(input: {
  organizationId: string;
  eventType: AnalyticsOutboxEventType;
  payload: Record<string, unknown>;
}): Promise<string> {
  ensureMigrations();
  const id = randomUUID();
  const now = new Date().toISOString();
  await db.execute(
    `INSERT INTO analytics_outbox (
      id, organization_id, event_type, payload_json, status, retry_count,
      last_error_code, next_retry_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, 'pending', 0, NULL, ?, ?, ?)`,
    [
      id,
      input.organizationId,
      input.eventType,
      JSON.stringify(input.payload),
      now,
      now,
      now,
    ]
  );
  return id;
}

export async function listPendingOutbox(
  limit = 50
): Promise<AnalyticsOutboxRow[]> {
  ensureMigrations();
  const now = new Date().toISOString();
  const rows = await db.query<Record<string, unknown>>(
    `SELECT * FROM analytics_outbox
     WHERE status IN ('pending', 'processing')
       AND (next_retry_at IS NULL OR next_retry_at <= ?)
     ORDER BY created_at ASC
     LIMIT ?`,
    [now, Math.min(Math.max(limit, 1), 200)]
  );
  return rows.map((row) => ({
    id: String(row.id),
    organizationId: String(row.organization_id),
    eventType: String(row.event_type),
    payload: parsePayload(row.payload_json),
    status: String(row.status) as AnalyticsOutboxStatus,
    retryCount: Number(row.retry_count ?? 0),
    lastErrorCode: row.last_error_code == null ? null : String(row.last_error_code),
    nextRetryAt: row.next_retry_at == null ? null : String(row.next_retry_at),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }));
}

export async function markOutboxProcessing(id: string): Promise<void> {
  const now = new Date().toISOString();
  await db.execute(
    `UPDATE analytics_outbox SET status = 'processing', updated_at = ? WHERE id = ?`,
    [now, id]
  );
}

export async function markOutboxCompleted(id: string): Promise<void> {
  const now = new Date().toISOString();
  await db.execute(
    `UPDATE analytics_outbox SET status = 'completed', updated_at = ?, last_error_code = NULL WHERE id = ?`,
    [now, id]
  );
}

export async function markOutboxFailure(
  id: string,
  retryCount: number,
  errorCode: string
): Promise<"pending" | "dead_letter"> {
  const now = new Date().toISOString();
  if (retryCount + 1 >= MAX_RETRIES) {
    await db.execute(
      `UPDATE analytics_outbox
       SET status = 'dead_letter', retry_count = ?, last_error_code = ?, updated_at = ?
       WHERE id = ?`,
      [retryCount + 1, errorCode.slice(0, 120), now, id]
    );
    return "dead_letter";
  }
  await db.execute(
    `UPDATE analytics_outbox
     SET status = 'pending', retry_count = ?, last_error_code = ?, next_retry_at = ?, updated_at = ?
     WHERE id = ?`,
    [retryCount + 1, errorCode.slice(0, 120), nextRetryIso(retryCount), now, id]
  );
  return "pending";
}

/**
 * Replay a dead-letter or pending row. Writes an audit event when actor is known.
 */
export async function replayOutboxEntry(input: {
  id: string;
  organizationId: string;
  actorUserId?: string | null;
  correlationId?: string;
}): Promise<boolean> {
  ensureMigrations();
  const row = await db.queryOne<Record<string, unknown>>(
    `SELECT id, status FROM analytics_outbox WHERE id = ? AND organization_id = ?`,
    [input.id, input.organizationId]
  );
  if (!row) return false;
  const now = new Date().toISOString();
  await db.execute(
    `UPDATE analytics_outbox
     SET status = 'pending', next_retry_at = ?, updated_at = ?, last_error_code = NULL
     WHERE id = ? AND organization_id = ?`,
    [now, now, input.id, input.organizationId]
  );
  await appendEnterpriseAuditEvent({
    organizationId: input.organizationId,
    actorUserId: input.actorUserId ?? null,
    action: "query_analytics.outbox_replay",
    resourceType: "analytics_outbox",
    resourceId: input.id,
    outcome: "success",
    correlationId: input.correlationId ?? randomUUID(),
    metadata: { previousStatus: String(row.status) },
  });
  return true;
}

/** Stable fingerprint for unanswered query text (never the plaintext). */
export function queryFingerprint(queryText: string): string {
  return createHash("sha256").update(queryText, "utf8").digest("hex");
}

/**
 * Drop obvious PII patterns and truncate for dashboard topic labels.
 * Never used for embedding / Pinecone.
 */
export function sanitizeTopic(queryText: string): string {
  const stripped = queryText
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[email]")
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, "[ip]")
    .replace(
      /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi,
      "[id]"
    )
    .replace(/\s+/g, " ")
    .trim();
  return stripped.slice(0, 120) || "query";
}

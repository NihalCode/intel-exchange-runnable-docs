import "server-only";

import { randomUUID } from "node:crypto";

import {
  classifyQueryOutcome,
  isUnansweredOutcome,
  type QueryOutcome,
} from "@/lib/agent/query-outcome";
import { db, ensureMigrations } from "@/lib/db/client";
import {
  encryptSecret,
} from "@/lib/documentation-credentials/encryption";
import type { ProductKey } from "@/lib/products/registry";
import {
  enqueueAnalyticsOutbox,
  listPendingOutbox,
  markOutboxCompleted,
  markOutboxFailure,
  markOutboxProcessing,
  queryFingerprint,
  sanitizeTopic,
} from "@/lib/query-analytics/outbox";
import {
  ensureUnansweredReviewForEvent,
  resolveUnansweredReviewsForLogicalQuery,
  upsertQueryAnalyticsEvent,
  type QueryAnalyticsEventInput,
} from "@/lib/query-analytics/repository";

export type LogicalQueryStatus =
  | "created"
  | "processing"
  | "streaming"
  | "completed"
  | "cancelled";

export type AttemptStatus =
  | "processing"
  | "streaming"
  | "completed"
  | "cancelled"
  | "provider_error"
  | "system_error";

export interface StartLogicalQueryInput {
  organizationId: string;
  logicalQueryId: string;
  userId?: string | null;
  conversationId?: string | null;
  turnId?: string | null;
  hostname: string;
  productId?: ProductKey | null;
  collectionId?: string | null;
  intent?: string | null;
}

export interface StartAttemptInput {
  organizationId: string;
  logicalQueryId: string;
  attemptId: string;
  requestId?: string | null;
  traceId?: string | null;
  modelVersion?: string | null;
  promptVersion?: string | null;
  indexVersion?: string | null;
  metadata?: Record<string, unknown>;
}

export interface CompleteAttemptInput {
  organizationId: string;
  attemptId: string;
  outcome: QueryOutcome;
  reasonCode?: string | null;
  retrievalResultCount?: number | null;
  citationCount?: number | null;
  latencyMs?: number | null;
  firstTokenLatencyMs?: number | null;
  metadata?: Record<string, unknown>;
}

export interface FinalizeLogicalQueryInput {
  organizationId: string;
  logicalQueryId: string;
  outcome: QueryOutcome;
  reasonCode?: string | null;
  status?: Extract<LogicalQueryStatus, "completed" | "cancelled">;
}

export interface RecordCancellationInput {
  organizationId: string;
  logicalQueryId: string;
  attemptId?: string;
  userId?: string | null;
  conversationId?: string | null;
  turnId?: string | null;
  hostname: string;
  productId?: ProductKey | null;
  requestId?: string | null;
  latencyMs?: number | null;
}

export interface LinkFeedbackInput {
  organizationId: string;
  logicalQueryId: string;
  feedbackId: string;
  rating?: number | string | null;
  note?: string | null;
}

export interface TerminalAnalyticsInput {
  organizationId: string;
  logicalQueryId: string;
  attemptId: string;
  userId?: string | null;
  conversationId?: string | null;
  turnId?: string | null;
  hostname: string;
  productId?: ProductKey | null;
  collectionId?: string | null;
  intent?: string | null;
  outcome: QueryOutcome;
  reasonCode?: string | null;
  retrievalResultCount?: number | null;
  citationCount?: number | null;
  latencyMs?: number | null;
  requestId?: string | null;
  traceId?: string | null;
  modelVersion?: string | null;
  promptVersion?: string | null;
  indexVersion?: string | null;
  metadata?: Record<string, unknown>;
  /** Exact user query — encrypted on unanswered rows only; never embedded or vector-indexed. */
  queryText?: string | null;
  clientIp?: string | null;
  customerNameSnapshot?: string | null;
}

function attemptStatusForOutcome(outcome: QueryOutcome): AttemptStatus {
  if (outcome === "cancelled") return "cancelled";
  if (outcome === "provider_error") return "provider_error";
  if (outcome === "system_error") return "system_error";
  return "completed";
}

function nowIso(): string {
  return new Date().toISOString();
}

/** Drop FK refs that are not present so AUTH_DISABLED mock ids cannot block recording. */
async function sanitizeAnalyticsFkRefs(input: {
  userId?: string | null;
  conversationId?: string | null;
  turnId?: string | null;
}): Promise<{
  userId: string | null;
  conversationId: string | null;
  turnId: string | null;
}> {
  let userId = input.userId ?? null;
  let conversationId = input.conversationId ?? null;
  let turnId = input.turnId ?? null;
  if (userId) {
    const row = await db.queryOne<{ id: string }>(
      `SELECT id FROM documentation_users WHERE id = ?`,
      [userId]
    );
    if (!row) userId = null;
  }
  if (conversationId) {
    const row = await db.queryOne<{ id: string }>(
      `SELECT id FROM agent_conversations WHERE id = ?`,
      [conversationId]
    );
    if (!row) conversationId = null;
  }
  if (turnId) {
    const row = await db.queryOne<{ id: string }>(
      `SELECT id FROM agent_turns WHERE id = ?`,
      [turnId]
    );
    if (!row) turnId = null;
  }
  return { userId, conversationId, turnId };
}

export async function startLogicalQuery(
  input: StartLogicalQueryInput
): Promise<{ id: string; created: boolean }> {
  ensureMigrations();
  const existing = await db.queryOne<{ id: string }>(
    `SELECT id FROM query_logical_queries
     WHERE organization_id = ? AND logical_query_id = ?`,
    [input.organizationId, input.logicalQueryId]
  );
  if (existing) {
    await db.execute(
      `UPDATE query_logical_queries
       SET status = CASE WHEN status IN ('completed','cancelled') THEN status ELSE 'processing' END,
           hostname = ?,
           product_id = COALESCE(?, product_id),
           collection_id = COALESCE(?, collection_id),
           intent = COALESCE(?, intent),
           user_id = COALESCE(?, user_id),
           conversation_id = COALESCE(?, conversation_id),
           turn_id = COALESCE(?, turn_id),
           updated_at = ?
       WHERE organization_id = ? AND logical_query_id = ?`,
      [
        input.hostname,
        input.productId ?? null,
        input.collectionId ?? null,
        input.intent ?? null,
        input.userId ?? null,
        input.conversationId ?? null,
        input.turnId ?? null,
        nowIso(),
        input.organizationId,
        input.logicalQueryId,
      ]
    );
    return { id: existing.id, created: false };
  }

  const id = randomUUID();
  const now = nowIso();
  const insertValues = (
    userId: string | null,
    conversationId: string | null,
    turnId: string | null
  ) => [
    id,
    input.organizationId,
    input.logicalQueryId,
    userId,
    conversationId,
    turnId,
    input.hostname,
    input.productId ?? null,
    input.collectionId ?? null,
    input.intent ?? null,
    now,
    now,
    now,
  ];
  try {
    await db.execute(
      `INSERT INTO query_logical_queries (
        id, organization_id, logical_query_id, user_id, conversation_id, turn_id,
        hostname, product_id, collection_id, intent, terminal_outcome, reason_code,
        status, started_at, completed_at, version, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, 'processing', ?, NULL, 1, ?, ?)`,
      insertValues(
        input.userId ?? null,
        input.conversationId ?? null,
        input.turnId ?? null
      )
    );
    return { id, created: true };
  } catch (err) {
    const raced = await db.queryOne<{ id: string }>(
      `SELECT id FROM query_logical_queries
       WHERE organization_id = ? AND logical_query_id = ?`,
      [input.organizationId, input.logicalQueryId]
    );
    if (raced) return { id: raced.id, created: false };
    // AUTH_DISABLED / stale sessions may pass non-persisted user/conversation ids.
    // Retry once with nullable FK columns cleared so analytics still records.
    const message = err instanceof Error ? err.message : String(err);
    if (/FOREIGN KEY|foreign key/i.test(message)) {
      try {
        await db.execute(
          `INSERT INTO query_logical_queries (
            id, organization_id, logical_query_id, user_id, conversation_id, turn_id,
            hostname, product_id, collection_id, intent, terminal_outcome, reason_code,
            status, started_at, completed_at, version, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, 'processing', ?, NULL, 1, ?, ?)`,
          insertValues(null, null, null)
        );
        return { id, created: true };
      } catch (retryErr) {
        const retryRaced = await db.queryOne<{ id: string }>(
          `SELECT id FROM query_logical_queries
           WHERE organization_id = ? AND logical_query_id = ?`,
          [input.organizationId, input.logicalQueryId]
        );
        if (retryRaced) return { id: retryRaced.id, created: false };
        throw new Error(
          `Failed to start logical query: ${
            retryErr instanceof Error ? retryErr.message : message
          }`
        );
      }
    }
    throw new Error(`Failed to start logical query: ${message}`);
  }
}

export async function startAttempt(
  input: StartAttemptInput
): Promise<{ id: string; created: boolean }> {
  ensureMigrations();
  const existing = await db.queryOne<{ id: string }>(
    `SELECT id FROM query_attempts
     WHERE organization_id = ? AND attempt_id = ?`,
    [input.organizationId, input.attemptId]
  );
  if (existing) return { id: existing.id, created: false };

  const logical = await db.queryOne<{ id: string }>(
    `SELECT id FROM query_logical_queries
     WHERE organization_id = ? AND logical_query_id = ?`,
    [input.organizationId, input.logicalQueryId]
  );
  if (!logical) {
    throw new Error("Logical query must exist before starting an attempt");
  }

  const id = randomUUID();
  const now = nowIso();
  try {
    await db.execute(
      `INSERT INTO query_attempts (
        id, organization_id, logical_query_row_id, logical_query_id, attempt_id,
        status, outcome, reason_code, retrieval_result_count, citation_count,
        request_id, trace_id, model_version, prompt_version, index_version,
        started_at, first_token_at, completed_at, latency_ms, first_token_latency_ms,
        metadata_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'processing', NULL, NULL, NULL, NULL, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, ?, ?, ?)`,
      [
        id,
        input.organizationId,
        logical.id,
        input.logicalQueryId,
        input.attemptId,
        input.requestId ?? null,
        input.traceId ?? null,
        input.modelVersion ?? null,
        input.promptVersion ?? null,
        input.indexVersion ?? null,
        now,
        JSON.stringify(input.metadata ?? {}),
        now,
        now,
      ]
    );
    return { id, created: true };
  } catch {
    const raced = await db.queryOne<{ id: string }>(
      `SELECT id FROM query_attempts
       WHERE organization_id = ? AND attempt_id = ?`,
      [input.organizationId, input.attemptId]
    );
    if (raced) return { id: raced.id, created: false };
    throw new Error("Failed to start attempt");
  }
}

export async function recordFirstToken(input: {
  organizationId: string;
  attemptId: string;
  at?: string;
}): Promise<boolean> {
  ensureMigrations();
  const row = await db.queryOne<{ started_at: string; first_token_at: string | null }>(
    `SELECT started_at, first_token_at FROM query_attempts
     WHERE organization_id = ? AND attempt_id = ?`,
    [input.organizationId, input.attemptId]
  );
  if (!row || row.first_token_at) return false;
  const at = input.at ?? nowIso();
  const firstTokenLatencyMs = Math.max(
    0,
    Date.parse(at) - Date.parse(String(row.started_at))
  );
  await db.execute(
    `UPDATE query_attempts
     SET status = CASE WHEN status = 'processing' THEN 'streaming' ELSE status END,
         first_token_at = ?,
         first_token_latency_ms = ?,
         updated_at = ?
     WHERE organization_id = ? AND attempt_id = ?`,
    [at, Number.isFinite(firstTokenLatencyMs) ? firstTokenLatencyMs : null, at, input.organizationId, input.attemptId]
  );
  return true;
}

export async function completeAttempt(
  input: CompleteAttemptInput
): Promise<boolean> {
  ensureMigrations();
  const existing = await db.queryOne<{
    id: string;
    status: string;
    started_at: string;
  }>(
    `SELECT id, status, started_at FROM query_attempts
     WHERE organization_id = ? AND attempt_id = ?`,
    [input.organizationId, input.attemptId]
  );
  if (!existing) return false;
  if (
    existing.status === "completed" ||
    existing.status === "cancelled" ||
    existing.status === "provider_error" ||
    existing.status === "system_error"
  ) {
    return false;
  }

  const completedAt = nowIso();
  const latencyMs =
    input.latencyMs ??
    Math.max(0, Date.parse(completedAt) - Date.parse(String(existing.started_at)));

  await db.execute(
    `UPDATE query_attempts
     SET status = ?,
         outcome = ?,
         reason_code = ?,
         retrieval_result_count = ?,
         citation_count = ?,
         completed_at = ?,
         latency_ms = ?,
         first_token_latency_ms = COALESCE(?, first_token_latency_ms),
         metadata_json = CASE
           WHEN ? IS NULL THEN metadata_json
           ELSE ?
         END,
         updated_at = ?
     WHERE organization_id = ? AND attempt_id = ?`,
    [
      attemptStatusForOutcome(input.outcome),
      input.outcome,
      input.reasonCode ?? null,
      input.retrievalResultCount ?? null,
      input.citationCount ?? null,
      completedAt,
      Number.isFinite(latencyMs) ? latencyMs : null,
      input.firstTokenLatencyMs ?? null,
      input.metadata ? JSON.stringify(input.metadata) : null,
      input.metadata ? JSON.stringify(input.metadata) : null,
      completedAt,
      input.organizationId,
      input.attemptId,
    ]
  );
  return true;
}

export async function finalizeLogicalQuery(
  input: FinalizeLogicalQueryInput
): Promise<boolean> {
  ensureMigrations();
  const status = input.status ?? (input.outcome === "cancelled" ? "cancelled" : "completed");
  const completedAt = nowIso();
  await db.execute(
    `UPDATE query_logical_queries
     SET terminal_outcome = ?,
         reason_code = COALESCE(?, reason_code),
         status = ?,
         completed_at = ?,
         updated_at = ?,
         version = version + 1
     WHERE organization_id = ? AND logical_query_id = ?`,
    [
      input.outcome,
      input.reasonCode ?? null,
      status,
      completedAt,
      completedAt,
      input.organizationId,
      input.logicalQueryId,
    ]
  );
  return true;
}

export async function linkFeedback(input: LinkFeedbackInput): Promise<void> {
  ensureMigrations();
  const now = nowIso();
  const logical = await db.queryOne<{ id: string; metadata?: unknown }>(
    `SELECT id FROM query_logical_queries
     WHERE organization_id = ? AND logical_query_id = ?`,
    [input.organizationId, input.logicalQueryId]
  );
  if (!logical) return;

  const attempt = await db.queryOne<{ id: string; metadata_json: string }>(
    `SELECT id, metadata_json FROM query_attempts
     WHERE organization_id = ? AND logical_query_id = ?
     ORDER BY started_at DESC LIMIT 1`,
    [input.organizationId, input.logicalQueryId]
  );
  if (!attempt) return;

  let metadata: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(String(attempt.metadata_json ?? "{}"));
    if (parsed && typeof parsed === "object") metadata = parsed as Record<string, unknown>;
  } catch {
    metadata = {};
  }
  metadata.feedback = {
    feedbackId: input.feedbackId,
    rating: input.rating ?? null,
    note: input.note ?? null,
    linkedAt: now,
  };
  await db.execute(
    `UPDATE query_attempts SET metadata_json = ?, updated_at = ? WHERE id = ?`,
    [JSON.stringify(metadata), now, attempt.id]
  );
}

/**
 * Thumbs-down / unsatisfied feedback → open (or reopen) an unanswered triage row
 * for the latest analytics event on this logical query. Idempotent per event.
 * Does not invent analytics events when none exist.
 */
export async function enqueueUnansweredFromNegativeFeedback(input: {
  organizationId: string;
  logicalQueryId: string;
  feedbackId: string;
  comment?: string | null;
}): Promise<{ reviewId: string | null; createdOrReopened: boolean }> {
  ensureMigrations();
  const logicalQueryId = input.logicalQueryId.trim();
  if (!logicalQueryId) return { reviewId: null, createdOrReopened: false };

  const event = await db.queryOne<{ id: string }>(
    `SELECT id FROM query_analytics_events
     WHERE organization_id = ? AND logical_query_id = ?
     ORDER BY created_at DESC
     LIMIT 1`,
    [input.organizationId, logicalQueryId]
  );
  if (!event) return { reviewId: null, createdOrReopened: false };

  const sanitizedComment = input.comment?.trim()
    ? sanitizeTopic(input.comment.trim())
    : null;
  const note = [
    `User marked answer unhelpful (feedback:${input.feedbackId})`,
    sanitizedComment ? `Feedback: ${sanitizedComment}` : null,
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, 2000);
  const topic =
    sanitizedComment ?? "User marked Ask AI answer unhelpful";
  const now = nowIso();

  const existingByLogical = await db.queryOne<{ id: string }>(
    `SELECT id FROM unanswered_query_reviews
     WHERE organization_id = ? AND logical_query_id = ?
     ORDER BY updated_at DESC
     LIMIT 1`,
    [input.organizationId, logicalQueryId]
  );

  if (existingByLogical) {
    await db.execute(
      `UPDATE unanswered_query_reviews
       SET status = 'NEW',
           resolved_by_logical_query_id = NULL,
           resolution_reference = NULL,
           internal_note = ?,
           sanitized_topic = COALESCE(?, sanitized_topic),
           logical_query_id = ?,
           analytics_event_id = ?,
           updated_at = ?,
           version = version + 1
       WHERE organization_id = ? AND id = ?`,
      [
        note,
        topic,
        logicalQueryId,
        event.id,
        now,
        input.organizationId,
        existingByLogical.id,
      ]
    );
    return { reviewId: existingByLogical.id, createdOrReopened: true };
  }

  await ensureUnansweredReviewForEvent(input.organizationId, event.id);

  await db.execute(
    `UPDATE unanswered_query_reviews
     SET status = 'NEW',
         resolved_by_logical_query_id = NULL,
         resolution_reference = NULL,
         internal_note = ?,
         sanitized_topic = COALESCE(?, sanitized_topic),
         logical_query_id = ?,
         updated_at = ?,
         version = version + 1
     WHERE organization_id = ? AND analytics_event_id = ?`,
    [note, topic, logicalQueryId, now, input.organizationId, event.id]
  );

  const review = await db.queryOne<{ id: string }>(
    `SELECT id FROM unanswered_query_reviews
     WHERE organization_id = ? AND analytics_event_id = ?`,
    [input.organizationId, event.id]
  );
  return { reviewId: review?.id ?? null, createdOrReopened: Boolean(review?.id) };
}

async function writeEncryptedUnansweredFields(input: {
  organizationId: string;
  analyticsEventId: string;
  logicalQueryId: string;
  queryText?: string | null;
  clientIp?: string | null;
  customerNameSnapshot?: string | null;
}): Promise<void> {
  const aad = `unanswered:${input.organizationId}:${input.logicalQueryId}`;
  const queryEnc = input.queryText
    ? encryptSecret(input.queryText, aad)
    : null;
  const ipEnc = input.clientIp ? encryptSecret(input.clientIp, aad) : null;
  const fingerprint = input.queryText ? queryFingerprint(input.queryText) : null;
  const topic = input.queryText ? sanitizeTopic(input.queryText) : null;

  await db.execute(
    `UPDATE unanswered_query_reviews
     SET query_ciphertext = COALESCE(?, query_ciphertext),
         query_iv = COALESCE(?, query_iv),
         query_tag = COALESCE(?, query_tag),
         query_fingerprint = COALESCE(?, query_fingerprint),
         sanitized_topic = COALESCE(?, sanitized_topic),
         ip_ciphertext = COALESCE(?, ip_ciphertext),
         ip_iv = COALESCE(?, ip_iv),
         ip_tag = COALESCE(?, ip_tag),
         customer_name_snapshot = COALESCE(?, customer_name_snapshot),
         logical_query_id = ?,
         updated_at = ?
     WHERE organization_id = ? AND analytics_event_id = ?`,
    [
      queryEnc?.ciphertext ?? null,
      queryEnc?.iv ?? null,
      queryEnc?.tag ?? null,
      fingerprint,
      topic,
      ipEnc?.ciphertext ?? null,
      ipEnc?.iv ?? null,
      ipEnc?.tag ?? null,
      input.customerNameSnapshot ?? null,
      input.logicalQueryId,
      nowIso(),
      input.organizationId,
      input.analyticsEventId,
    ]
  );
}

/**
 * Authoritative terminal write: logical query + attempt + compat projection +
 * unanswered queue. Failures are rethrown so callers can enqueue the outbox.
 */
export async function materializeTerminalAnalytics(
  input: TerminalAnalyticsInput
): Promise<{ eventId: string }> {
  ensureMigrations();
  const fk = await sanitizeAnalyticsFkRefs({
    userId: input.userId,
    conversationId: input.conversationId,
    turnId: input.turnId,
  });
  await startLogicalQuery({
    organizationId: input.organizationId,
    logicalQueryId: input.logicalQueryId,
    userId: fk.userId,
    conversationId: fk.conversationId,
    turnId: fk.turnId,
    hostname: input.hostname,
    productId: input.productId,
    collectionId: input.collectionId,
    intent: input.intent,
  });
  await startAttempt({
    organizationId: input.organizationId,
    logicalQueryId: input.logicalQueryId,
    attemptId: input.attemptId,
    requestId: input.requestId,
    traceId: input.traceId,
    modelVersion: input.modelVersion,
    promptVersion: input.promptVersion,
    indexVersion: input.indexVersion,
    metadata: input.metadata,
  });
  await completeAttempt({
    organizationId: input.organizationId,
    attemptId: input.attemptId,
    outcome: input.outcome,
    reasonCode: input.reasonCode,
    retrievalResultCount: input.retrievalResultCount,
    citationCount: input.citationCount,
    latencyMs: input.latencyMs,
  });
  await finalizeLogicalQuery({
    organizationId: input.organizationId,
    logicalQueryId: input.logicalQueryId,
    outcome: input.outcome,
    reasonCode: input.reasonCode,
  });

  const projection: QueryAnalyticsEventInput = {
    organizationId: input.organizationId,
    userId: fk.userId,
    conversationId: fk.conversationId,
    turnId: fk.turnId,
    logicalQueryId: input.logicalQueryId,
    attemptId: input.attemptId,
    hostname: input.hostname,
    productId: input.productId,
    collectionId: input.collectionId,
    intent: input.intent,
    outcome: input.outcome,
    retrievalResultCount: input.retrievalResultCount,
    citationCount: input.citationCount,
    latencyMs: input.latencyMs,
    requestId: input.requestId,
    traceId: input.traceId,
    modelVersion: input.modelVersion,
    promptVersion: input.promptVersion,
    indexVersion: input.indexVersion,
    metadata: input.metadata,
  };
  const eventId = await upsertQueryAnalyticsEvent(projection);

  if (isUnansweredOutcome(input.outcome)) {
    await ensureUnansweredReviewForEvent(input.organizationId, eventId);
    await writeEncryptedUnansweredFields({
      organizationId: input.organizationId,
      analyticsEventId: eventId,
      logicalQueryId: input.logicalQueryId,
      queryText: input.queryText,
      clientIp: input.clientIp,
      customerNameSnapshot: input.customerNameSnapshot,
    });
  } else if (
    input.outcome === "answered" ||
    input.outcome === "partially_answered"
  ) {
    await resolveUnansweredReviewsForLogicalQuery({
      organizationId: input.organizationId,
      logicalQueryId: input.logicalQueryId,
      resolvedByLogicalQueryId: input.logicalQueryId,
    });
  }

  return { eventId };
}

/**
 * Best-effort terminal recording. On sync failure, enqueue outbox and return
 * without throwing so chat success is never blocked.
 */
export async function recordTerminalAnalyticsSafe(
  input: TerminalAnalyticsInput
): Promise<{ eventId: string | null; outboxId: string | null }> {
  try {
    const { eventId } = await materializeTerminalAnalytics(input);
    return { eventId, outboxId: null };
  } catch (err) {
    const outboxId = await enqueueAnalyticsOutbox({
      organizationId: input.organizationId,
      eventType: "materialize_attempt",
      payload: { ...input } as unknown as Record<string, unknown>,
    }).catch(() => null);
    console.warn(
      JSON.stringify({
        level: "warn",
        message: "query_analytics_materialize_failed",
        organizationId: input.organizationId,
        attemptId: input.attemptId,
        outboxId,
        error: err instanceof Error ? err.message : "unknown",
      })
    );
    return { eventId: null, outboxId };
  }
}

export async function recordCancellation(
  input: RecordCancellationInput
): Promise<{ eventId: string | null; outboxId: string | null }> {
  const attemptId = input.attemptId ?? randomUUID();
  return recordTerminalAnalyticsSafe({
    organizationId: input.organizationId,
    logicalQueryId: input.logicalQueryId,
    attemptId,
    userId: input.userId,
    conversationId: input.conversationId,
    turnId: input.turnId,
    hostname: input.hostname,
    productId: input.productId,
    outcome: "cancelled",
    requestId: input.requestId,
    latencyMs: input.latencyMs,
  });
}

function payloadToTerminal(
  payload: Record<string, unknown>
): TerminalAnalyticsInput | null {
  const organizationId = String(payload.organizationId ?? "");
  const logicalQueryId = String(payload.logicalQueryId ?? "");
  const attemptId = String(payload.attemptId ?? "");
  const hostname = String(payload.hostname ?? "");
  const outcome = String(payload.outcome ?? "") as QueryOutcome;
  if (!organizationId || !logicalQueryId || !attemptId || !hostname || !outcome) {
    return null;
  }
  return {
    organizationId,
    logicalQueryId,
    attemptId,
    hostname,
    outcome,
    userId: (payload.userId as string | null | undefined) ?? null,
    conversationId: (payload.conversationId as string | null | undefined) ?? null,
    turnId: (payload.turnId as string | null | undefined) ?? null,
    productId: (payload.productId as ProductKey | null | undefined) ?? null,
    collectionId: (payload.collectionId as string | null | undefined) ?? null,
    intent: (payload.intent as string | null | undefined) ?? null,
    reasonCode: (payload.reasonCode as string | null | undefined) ?? null,
    retrievalResultCount:
      typeof payload.retrievalResultCount === "number"
        ? payload.retrievalResultCount
        : null,
    citationCount:
      typeof payload.citationCount === "number" ? payload.citationCount : null,
    latencyMs: typeof payload.latencyMs === "number" ? payload.latencyMs : null,
    requestId: (payload.requestId as string | null | undefined) ?? null,
    traceId: (payload.traceId as string | null | undefined) ?? null,
    modelVersion: (payload.modelVersion as string | null | undefined) ?? null,
    promptVersion: (payload.promptVersion as string | null | undefined) ?? null,
    indexVersion: (payload.indexVersion as string | null | undefined) ?? null,
    metadata:
      payload.metadata && typeof payload.metadata === "object"
        ? (payload.metadata as Record<string, unknown>)
        : undefined,
    queryText: (payload.queryText as string | null | undefined) ?? null,
    clientIp: (payload.clientIp as string | null | undefined) ?? null,
    customerNameSnapshot:
      (payload.customerNameSnapshot as string | null | undefined) ?? null,
  };
}

/** Process pending outbox rows (control-plane / npm script worker). */
export async function processAnalyticsOutbox(limit = 50): Promise<{
  processed: number;
  completed: number;
  failed: number;
  deadLetter: number;
}> {
  ensureMigrations();
  const pending = await listPendingOutbox(limit);
  let completed = 0;
  let failed = 0;
  let deadLetter = 0;

  for (const row of pending) {
    await markOutboxProcessing(row.id);
    try {
      if (
        row.eventType === "materialize_attempt" ||
        row.eventType === "record_cancellation" ||
        row.eventType === "replay"
      ) {
        const terminal = payloadToTerminal(row.payload);
        if (!terminal) throw new Error("INVALID_OUTBOX_PAYLOAD");
        await materializeTerminalAnalytics(terminal);
      } else {
        throw new Error("UNKNOWN_EVENT_TYPE");
      }
      await markOutboxCompleted(row.id);
      completed += 1;
    } catch (err) {
      const code =
        err instanceof Error ? err.message.slice(0, 80) : "OUTBOX_FAILURE";
      const next = await markOutboxFailure(row.id, row.retryCount, code);
      if (next === "dead_letter") deadLetter += 1;
      else failed += 1;
    }
  }

  return {
    processed: pending.length,
    completed,
    failed,
    deadLetter,
  };
}

/** Mint a server-side logical query id when no owned turn is available. */
export function mintLogicalQueryId(): string {
  return randomUUID();
}

export function classifyFromAgentResult(input: {
  response?: Parameters<typeof classifyQueryOutcome>[0]["response"];
  httpStatus?: number;
  errorCode?: string;
  cancelled?: boolean;
  retrievalCount?: number;
}): QueryOutcome {
  return classifyQueryOutcome(input);
}

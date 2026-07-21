import "server-only";

import { randomUUID } from "node:crypto";

import { db, ensureMigrations } from "@/lib/db/client";
import {
  decryptSecret,
  encryptSecret,
} from "@/lib/documentation-credentials/encryption";
import type { ProductKey } from "@/lib/products/registry";

export type FeedbackRating = "up" | "down";

export interface ChatFeedbackRow {
  id: string;
  organizationId: string;
  userId: string;
  conversationId: string | null;
  turnId: string | null;
  logicalQueryId: string | null;
  messageId: string;
  hostname: string | null;
  productId: ProductKey | null;
  rating: FeedbackRating;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertChatFeedbackInput {
  organizationId: string;
  userId: string;
  messageId: string;
  rating: FeedbackRating;
  comment?: string | null;
  conversationId?: string | null;
  turnId?: string | null;
  logicalQueryId?: string | null;
  hostname?: string | null;
  productId?: ProductKey | null;
  expectedVersion?: number;
}

function nowIso(): string {
  return new Date().toISOString();
}

function mapRow(row: Record<string, unknown>): ChatFeedbackRow {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    userId: String(row.user_id),
    conversationId: row.conversation_id ? String(row.conversation_id) : null,
    turnId: row.turn_id ? String(row.turn_id) : null,
    logicalQueryId: row.logical_query_id ? String(row.logical_query_id) : null,
    messageId: String(row.message_id),
    hostname: row.hostname ? String(row.hostname) : null,
    productId: (row.product_id as ProductKey | null) ?? null,
    rating: row.rating as FeedbackRating,
    version: Number(row.version ?? 1),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export async function findFeedbackByMessage(input: {
  organizationId: string;
  userId: string;
  messageId: string;
}): Promise<ChatFeedbackRow | null> {
  ensureMigrations();
  const row = await db.queryOne<Record<string, unknown>>(
    `SELECT id, organization_id, user_id, conversation_id, turn_id, logical_query_id,
            message_id, hostname, product_id, rating, version, created_at, updated_at
     FROM chat_feedback
     WHERE organization_id = ? AND user_id = ? AND message_id = ?`,
    [input.organizationId, input.userId, input.messageId]
  );
  return row ? mapRow(row) : null;
}

export async function getOwnedFeedback(input: {
  organizationId: string;
  userId: string;
  id: string;
}): Promise<ChatFeedbackRow | null> {
  ensureMigrations();
  const row = await db.queryOne<Record<string, unknown>>(
    `SELECT id, organization_id, user_id, conversation_id, turn_id, logical_query_id,
            message_id, hostname, product_id, rating, version, created_at, updated_at
     FROM chat_feedback
     WHERE organization_id = ? AND user_id = ? AND id = ?`,
    [input.organizationId, input.userId, input.id]
  );
  return row ? mapRow(row) : null;
}

export async function upsertChatFeedback(
  input: UpsertChatFeedbackInput
): Promise<ChatFeedbackRow> {
  ensureMigrations();
  const now = nowIso();
  const existing = await findFeedbackByMessage({
    organizationId: input.organizationId,
    userId: input.userId,
    messageId: input.messageId,
  });

  const comment =
    input.comment != null && String(input.comment).trim()
      ? String(input.comment).trim().slice(0, 2000)
      : null;

  if (existing) {
    if (
      input.expectedVersion != null &&
      input.expectedVersion !== existing.version
    ) {
      throw new FeedbackConflictError();
    }
    const aad = `feedback:${input.organizationId}:${existing.id}`;
    const enc = comment ? encryptSecret(comment, aad) : null;
    await db.execute(
      `UPDATE chat_feedback
       SET rating = ?,
           comment_ciphertext = ?,
           comment_iv = ?,
           comment_tag = ?,
           conversation_id = COALESCE(?, conversation_id),
           turn_id = COALESCE(?, turn_id),
           logical_query_id = COALESCE(?, logical_query_id),
           hostname = COALESCE(?, hostname),
           product_id = COALESCE(?, product_id),
           version = version + 1,
           updated_at = ?
       WHERE id = ? AND organization_id = ? AND user_id = ? AND version = ?`,
      [
        input.rating,
        enc?.ciphertext ?? null,
        enc?.iv ?? null,
        enc?.tag ?? null,
        input.conversationId ?? null,
        input.turnId ?? null,
        input.logicalQueryId ?? null,
        input.hostname ?? null,
        input.productId ?? null,
        now,
        existing.id,
        input.organizationId,
        input.userId,
        existing.version,
      ]
    );
    const updated = await getOwnedFeedback({
      organizationId: input.organizationId,
      userId: input.userId,
      id: existing.id,
    });
    if (!updated) throw new FeedbackConflictError();
    return updated;
  }

  const id = randomUUID();
  const aad = `feedback:${input.organizationId}:${id}`;
  const enc = comment ? encryptSecret(comment, aad) : null;
  await db.execute(
    `INSERT INTO chat_feedback (
       id, organization_id, user_id, conversation_id, turn_id, logical_query_id,
       message_id, hostname, product_id, rating,
       comment_ciphertext, comment_iv, comment_tag,
       version, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    [
      id,
      input.organizationId,
      input.userId,
      input.conversationId ?? null,
      input.turnId ?? null,
      input.logicalQueryId ?? null,
      input.messageId,
      input.hostname ?? null,
      input.productId ?? null,
      input.rating,
      enc?.ciphertext ?? null,
      enc?.iv ?? null,
      enc?.tag ?? null,
      now,
      now,
    ]
  );
  const created = await getOwnedFeedback({
    organizationId: input.organizationId,
    userId: input.userId,
    id,
  });
  if (!created) throw new Error("Failed to create feedback");
  return created;
}

export async function updateOwnedFeedback(input: {
  organizationId: string;
  userId: string;
  id: string;
  rating?: FeedbackRating;
  comment?: string | null;
  expectedVersion?: number;
}): Promise<ChatFeedbackRow | null> {
  ensureMigrations();
  const existing = await getOwnedFeedback(input);
  if (!existing) return null;
  if (
    input.expectedVersion != null &&
    input.expectedVersion !== existing.version
  ) {
    throw new FeedbackConflictError();
  }

  const rating = input.rating ?? existing.rating;
  let encCipher: string | null = null;
  let encIv: string | null = null;
  let encTag: string | null = null;
  if (input.comment !== undefined) {
    const trimmed =
      input.comment != null && String(input.comment).trim()
        ? String(input.comment).trim().slice(0, 2000)
        : null;
    if (trimmed) {
      const enc = encryptSecret(
        trimmed,
        `feedback:${input.organizationId}:${existing.id}`
      );
      encCipher = enc.ciphertext;
      encIv = enc.iv;
      encTag = enc.tag;
    }
  } else {
    const prior = await db.queryOne<{
      comment_ciphertext: string | null;
      comment_iv: string | null;
      comment_tag: string | null;
    }>(
      `SELECT comment_ciphertext, comment_iv, comment_tag FROM chat_feedback WHERE id = ?`,
      [existing.id]
    );
    encCipher = prior?.comment_ciphertext ?? null;
    encIv = prior?.comment_iv ?? null;
    encTag = prior?.comment_tag ?? null;
  }

  const now = nowIso();
  await db.execute(
    `UPDATE chat_feedback
     SET rating = ?,
         comment_ciphertext = ?,
         comment_iv = ?,
         comment_tag = ?,
         version = version + 1,
         updated_at = ?
     WHERE id = ? AND organization_id = ? AND user_id = ? AND version = ?`,
    [
      rating,
      encCipher,
      encIv,
      encTag,
      now,
      existing.id,
      input.organizationId,
      input.userId,
      existing.version,
    ]
  );
  return getOwnedFeedback(input);
}

export async function deleteOwnedFeedback(input: {
  organizationId: string;
  userId: string;
  id: string;
}): Promise<boolean> {
  ensureMigrations();
  const existing = await getOwnedFeedback(input);
  if (!existing) return false;
  await db.execute(
    `DELETE FROM chat_feedback
     WHERE organization_id = ? AND user_id = ? AND id = ?`,
    [input.organizationId, input.userId, input.id]
  );
  return true;
}

export async function decryptFeedbackComment(input: {
  organizationId: string;
  feedbackId: string;
}): Promise<string | null> {
  ensureMigrations();
  const row = await db.queryOne<{
    comment_ciphertext: string | null;
    comment_iv: string | null;
    comment_tag: string | null;
  }>(
    `SELECT comment_ciphertext, comment_iv, comment_tag
     FROM chat_feedback WHERE organization_id = ? AND id = ?`,
    [input.organizationId, input.feedbackId]
  );
  if (!row?.comment_ciphertext || !row.comment_iv || !row.comment_tag) {
    return null;
  }
  return decryptSecret(
    {
      ciphertext: row.comment_ciphertext,
      iv: row.comment_iv,
      tag: row.comment_tag,
    },
    `feedback:${input.organizationId}:${input.feedbackId}`
  );
}

export class FeedbackConflictError extends Error {
  readonly code = "FEEDBACK_CONFLICT";
  constructor() {
    super("Feedback version conflict");
    this.name = "FeedbackConflictError";
  }
}

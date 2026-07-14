import "server-only";

import { randomUUID } from "node:crypto";

import {
  ensureMigrations,
  withOrganizationTransaction,
  type DbExecutor,
} from "@/lib/db/client";
import { maskText } from "@/lib/security";

const SCHEMA_VERSION = 1;

export type AgentTurnStatus = "started" | "completed" | "cancelled" | "failed";
export type AgentMessageRole = "user" | "assistant" | "system";
export type AgentMessageType =
  | "user_message"
  | "assistant_status"
  | "assistant_final"
  | "recoverable_error"
  | "terminal_error";

export interface AgentConversation {
  id: string;
  organizationId: string;
  userId: string;
  title: string;
  schemaVersion: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface AgentTurn {
  id: string;
  conversationId: string;
  organizationId: string;
  userId: string;
  status: AgentTurnStatus;
  requestId: string | null;
  idempotencyKey: string;
  schemaVersion: number;
  createdAt: string;
  updatedAt: string;
}

export interface AgentMessage {
  id: string;
  turnId: string;
  conversationId: string;
  organizationId: string;
  role: AgentMessageRole;
  type: AgentMessageType;
  sequence: number;
  contentText: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface AgentConversationDetail {
  conversation: AgentConversation;
  turns: AgentTurn[];
  messages: AgentMessage[];
}

export class ConversationStoreConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConversationStoreConflictError";
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

function parseMetadata(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  try {
    const parsed = JSON.parse(String(value ?? "{}"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function conversationFromRow(row: Record<string, unknown>): AgentConversation {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    userId: String(row.user_id),
    title: String(row.title),
    schemaVersion: Number(row.schema_version),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    deletedAt: row.deleted_at == null ? null : String(row.deleted_at),
  };
}

function turnFromRow(row: Record<string, unknown>): AgentTurn {
  return {
    id: String(row.id),
    conversationId: String(row.conversation_id),
    organizationId: String(row.organization_id),
    userId: String(row.user_id),
    status: row.status as AgentTurnStatus,
    requestId: row.request_id == null ? null : String(row.request_id),
    idempotencyKey: String(row.idempotency_key),
    schemaVersion: Number(row.schema_version),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function messageFromRow(row: Record<string, unknown>): AgentMessage {
  return {
    id: String(row.id),
    turnId: String(row.turn_id),
    conversationId: String(row.conversation_id),
    organizationId: String(row.organization_id),
    role: row.role as AgentMessageRole,
    type: row.type as AgentMessageType,
    sequence: Number(row.sequence),
    contentText: String(row.content_text),
    metadata: parseMetadata(row.metadata_json),
    createdAt: String(row.created_at),
  };
}

function sanitizedMetadata(metadata?: Record<string, unknown>): Record<string, unknown> {
  const blocked = /secret|token|credential|authorization|signature|password|reasoning|chain[_ -]?of[_ -]?thought/i;
  return Object.fromEntries(
    Object.entries(metadata ?? {})
      .filter(([key]) => !blocked.test(key))
      .map(([key, value]) => [key, typeof value === "string" ? maskText(value) : value])
  );
}

function sanitizedContent(contentText: string): string {
  return maskText(contentText);
}

async function getScopedConversation(
  tx: DbExecutor,
  conversationId: string,
  organizationId: string,
  userId: string
): Promise<AgentConversation | null> {
  const row = await tx.queryOne(
    `SELECT * FROM agent_conversations
     WHERE id = ? AND organization_id = ? AND user_id = ? AND deleted_at IS NULL`,
    [conversationId, organizationId, userId]
  );
  return row ? conversationFromRow(row) : null;
}

async function getScopedTurn(
  tx: DbExecutor,
  turnId: string,
  organizationId: string,
  userId: string
): Promise<AgentTurn | null> {
  const row = await tx.queryOne(
    `SELECT * FROM agent_turns WHERE id = ? AND organization_id = ? AND user_id = ?`,
    [turnId, organizationId, userId]
  );
  return row ? turnFromRow(row) : null;
}

export async function createConversation(input: {
  organizationId: string;
  userId: string;
  title?: string;
}): Promise<AgentConversation> {
  ensureMigrations();
  const now = nowIso();
  const id = randomUUID();
  return withOrganizationTransaction(
    { organizationId: input.organizationId, userId: input.userId },
    async (tx) => {
      await tx.execute(
        `INSERT INTO agent_conversations (
          id, organization_id, user_id, title, schema_version, created_at, updated_at, deleted_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL)`,
        [id, input.organizationId, input.userId, input.title?.trim() || "New conversation", SCHEMA_VERSION, now, now]
      );
      return (await getScopedConversation(tx, id, input.organizationId, input.userId))!;
    }
  );
}

export async function listConversations(
  organizationId: string,
  userId: string
): Promise<AgentConversation[]> {
  ensureMigrations();
  return withOrganizationTransaction({ organizationId, userId }, async (tx) => {
    const rows = await tx.query(
      `SELECT * FROM agent_conversations
       WHERE organization_id = ? AND user_id = ? AND deleted_at IS NULL
       ORDER BY updated_at DESC, created_at DESC`,
      [organizationId, userId]
    );
    return rows.map(conversationFromRow);
  });
}

export async function getConversation(
  conversationId: string,
  organizationId: string,
  userId: string
): Promise<AgentConversationDetail | null> {
  ensureMigrations();
  return withOrganizationTransaction({ organizationId, userId }, async (tx) => {
    const conversation = await getScopedConversation(tx, conversationId, organizationId, userId);
    if (!conversation) return null;
    const [turnRows, messageRows] = await Promise.all([
      tx.query(
        `SELECT * FROM agent_turns
         WHERE conversation_id = ? AND organization_id = ? AND user_id = ?
         ORDER BY created_at, id`,
        [conversationId, organizationId, userId]
      ),
      tx.query(
        `SELECT * FROM agent_messages
         WHERE conversation_id = ? AND organization_id = ?
         ORDER BY created_at, sequence, id`,
        [conversationId, organizationId]
      ),
    ]);
    return {
      conversation,
      turns: turnRows.map(turnFromRow),
      messages: messageRows.map(messageFromRow),
    };
  });
}

export async function startTurn(input: {
  conversationId: string;
  userId: string;
  orgId: string;
  idempotencyKey: string;
  userText: string;
  requestId?: string;
}): Promise<{ turn: AgentTurn; userMessage: AgentMessage; idempotent: boolean }> {
  ensureMigrations();
  return withOrganizationTransaction(
    { organizationId: input.orgId, userId: input.userId },
    async (tx) => {
      const existing = await tx.queryOne(
        `SELECT * FROM agent_turns
         WHERE organization_id = ? AND user_id = ? AND idempotency_key = ?`,
        [input.orgId, input.userId, input.idempotencyKey]
      );
      if (existing) {
        const turn = turnFromRow(existing);
        if (turn.conversationId !== input.conversationId) {
          throw new ConversationStoreConflictError("Idempotency key belongs to another conversation");
        }
        const userMessageRow = await tx.queryOne(
          "SELECT * FROM agent_messages WHERE turn_id = ? AND type = 'user_message' LIMIT 1",
          [turn.id]
        );
        return {
          turn,
          userMessage: messageFromRow(userMessageRow!),
          idempotent: true,
        };
      }

      if (!(await getScopedConversation(tx, input.conversationId, input.orgId, input.userId))) {
        throw new ConversationStoreConflictError("Conversation not found");
      }
      const now = nowIso();
      const turnId = randomUUID();
      const messageId = randomUUID();
      const contentText = sanitizedContent(input.userText);
      await tx.execute(
        `INSERT INTO agent_turns (
          id, conversation_id, organization_id, user_id, status, request_id,
          idempotency_key, schema_version, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 'started', ?, ?, ?, ?, ?)`,
        [turnId, input.conversationId, input.orgId, input.userId, input.requestId ?? null, input.idempotencyKey, SCHEMA_VERSION, now, now]
      );
      await tx.execute(
        `INSERT INTO agent_messages (
          id, turn_id, conversation_id, organization_id, role, type, sequence,
          content_text, metadata_json, created_at
        ) VALUES (?, ?, ?, ?, 'user', 'user_message', 1, ?, '{}', ?)`,
        [messageId, turnId, input.conversationId, input.orgId, contentText, now]
      );
      await tx.execute(
        "UPDATE agent_conversations SET updated_at = ? WHERE id = ? AND organization_id = ? AND user_id = ?",
        [now, input.conversationId, input.orgId, input.userId]
      );
      return {
        turn: (await getScopedTurn(tx, turnId, input.orgId, input.userId))!,
        userMessage: messageFromRow(
          (await tx.queryOne("SELECT * FROM agent_messages WHERE id = ?", [messageId]))!
        ),
        idempotent: false,
      };
    }
  );
}

export async function appendMessage(input: {
  turnId: string;
  organizationId: string;
  userId: string;
  role: AgentMessageRole;
  type: Exclude<AgentMessageType, "assistant_final">;
  contentText: string;
  metadata?: Record<string, unknown>;
}): Promise<AgentMessage> {
  ensureMigrations();
  return withOrganizationTransaction(
    { organizationId: input.organizationId, userId: input.userId },
    async (tx) => {
      const turn = await getScopedTurn(tx, input.turnId, input.organizationId, input.userId);
      if (!turn) throw new ConversationStoreConflictError("Turn not found");
      const row = await tx.queryOne<{ max_sequence: number | null }>(
        "SELECT MAX(sequence) AS max_sequence FROM agent_messages WHERE turn_id = ?",
        [turn.id]
      );
      const now = nowIso();
      const id = randomUUID();
      const sequence = Number(row?.max_sequence ?? 0) + 1;
      await tx.execute(
        `INSERT INTO agent_messages (
          id, turn_id, conversation_id, organization_id, role, type, sequence,
          content_text, metadata_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id, turn.id, turn.conversationId, input.organizationId, input.role, input.type, sequence,
          sanitizedContent(input.contentText), JSON.stringify(sanitizedMetadata(input.metadata)), now,
        ]
      );
      await tx.execute("UPDATE agent_turns SET updated_at = ? WHERE id = ?", [now, turn.id]);
      return messageFromRow((await tx.queryOne("SELECT * FROM agent_messages WHERE id = ?", [id]))!);
    }
  );
}

export async function completeTurnWithFinal(input: {
  turnId: string;
  organizationId: string;
  userId: string;
  contentText: string;
  metadata?: Record<string, unknown>;
}): Promise<{ message: AgentMessage; idempotent: boolean }> {
  ensureMigrations();
  return withOrganizationTransaction(
    { organizationId: input.organizationId, userId: input.userId },
    async (tx) => {
      const turn = await getScopedTurn(tx, input.turnId, input.organizationId, input.userId);
      if (!turn) throw new ConversationStoreConflictError("Turn not found");
      const existing = await tx.queryOne(
        "SELECT * FROM agent_messages WHERE turn_id = ? AND type = 'assistant_final' LIMIT 1",
        [turn.id]
      );
      if (existing) return { message: messageFromRow(existing), idempotent: true };
      if (turn.status === "cancelled") throw new ConversationStoreConflictError("Turn is cancelled");

      const sequenceRow = await tx.queryOne<{ max_sequence: number | null }>(
        "SELECT MAX(sequence) AS max_sequence FROM agent_messages WHERE turn_id = ?",
        [turn.id]
      );
      const now = nowIso();
      const id = randomUUID();
      await tx.execute(
        `INSERT INTO agent_messages (
          id, turn_id, conversation_id, organization_id, role, type, sequence,
          content_text, metadata_json, created_at
        ) VALUES (?, ?, ?, ?, 'assistant', 'assistant_final', ?, ?, ?, ?)`,
        [
          id, turn.id, turn.conversationId, input.organizationId,
          Number(sequenceRow?.max_sequence ?? 0) + 1,
          sanitizedContent(input.contentText), JSON.stringify(sanitizedMetadata(input.metadata)), now,
        ]
      );
      await tx.execute(
        "UPDATE agent_turns SET status = 'completed', updated_at = ? WHERE id = ?",
        [now, turn.id]
      );
      await tx.execute(
        "UPDATE agent_conversations SET updated_at = ? WHERE id = ? AND organization_id = ? AND user_id = ?",
        [now, turn.conversationId, input.organizationId, input.userId]
      );
      return {
        message: messageFromRow((await tx.queryOne("SELECT * FROM agent_messages WHERE id = ?", [id]))!),
        idempotent: false,
      };
    }
  );
}

export async function cancelTurn(
  turnId: string,
  organizationId: string,
  userId: string
): Promise<AgentTurn | null> {
  ensureMigrations();
  return withOrganizationTransaction({ organizationId, userId }, async (tx) => {
    const turn = await getScopedTurn(tx, turnId, organizationId, userId);
    if (!turn) return null;
    if (turn.status === "completed") return turn;
    const now = nowIso();
    await tx.execute(
      `UPDATE agent_turns SET status = 'cancelled', updated_at = ?
       WHERE id = ? AND organization_id = ? AND user_id = ?`,
      [now, turnId, organizationId, userId]
    );
    return getScopedTurn(tx, turnId, organizationId, userId);
  });
}

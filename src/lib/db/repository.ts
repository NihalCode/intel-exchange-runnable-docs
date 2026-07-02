import "server-only";

import { randomUUID } from "node:crypto";

import { ensureMigrations, runExecute, runQuery, runQueryOne } from "@/lib/db/client";
import { normalizeEmail } from "@/lib/documentation-auth/email-utils";
import { generateInviteToken, hashInviteToken } from "@/lib/documentation-auth/invite-tokens";
import { isDocumentationRole } from "@/lib/documentation-auth/permissions";
import type {
  DocumentationAuditLog,
  DocumentationInvite,
  DocumentationRole,
  DocumentationUser,
  InviteStatus,
} from "@/lib/documentation-auth/types";

const DEFAULT_EXPIRY_DAYS = 7;

function nowIso(): string {
  return new Date().toISOString();
}

function rowToUser(row: Record<string, unknown>): DocumentationUser {
  return {
    id: String(row.id),
    auth0UserId: String(row.auth0_user_id),
    email: String(row.email),
    name: row.name != null ? String(row.name) : null,
    picture: row.picture != null ? String(row.picture) : null,
    role: row.role as DocumentationRole,
    status: row.status as DocumentationUser["status"],
    invitedByUserId:
      row.invited_by_user_id != null ? String(row.invited_by_user_id) : null,
    acceptedInviteAt:
      row.accepted_invite_at != null ? String(row.accepted_invite_at) : null,
    lastLoginAt: row.last_login_at != null ? String(row.last_login_at) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function rowToInvite(row: Record<string, unknown>): DocumentationInvite {
  return {
    id: String(row.id),
    email: String(row.email),
    role: row.role as DocumentationRole,
    tokenHash: String(row.token_hash),
    status: row.status as InviteStatus,
    invitedByUserId: String(row.invited_by_user_id),
    expiresAt: String(row.expires_at),
    acceptedAt: row.accepted_at != null ? String(row.accepted_at) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function rowToAudit(row: Record<string, unknown>): DocumentationAuditLog {
  let metadata: Record<string, unknown> | null = null;
  if (row.metadata != null) {
    if (typeof row.metadata === "object") {
      metadata = row.metadata as Record<string, unknown>;
    } else {
      try {
        metadata = JSON.parse(String(row.metadata)) as Record<string, unknown>;
      } catch {
        metadata = null;
      }
    }
  }
  return {
    id: String(row.id),
    action: String(row.action),
    userId: row.user_id != null ? String(row.user_id) : null,
    actorEmail: row.actor_email != null ? String(row.actor_email) : null,
    metadata,
    createdAt: String(row.created_at),
  };
}

function defaultExpiryDays(): number {
  const raw = process.env.INVITE_DEFAULT_EXPIRY_DAYS?.trim();
  const parsed = raw ? Number.parseInt(raw, 10) : DEFAULT_EXPIRY_DAYS;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_EXPIRY_DAYS;
}

export function inviteExpiryFromDays(days: number): Date {
  const expires = new Date();
  expires.setUTCDate(expires.getUTCDate() + days);
  return expires;
}

function isExpired(invite: DocumentationInvite, now = Date.now()): boolean {
  return new Date(invite.expiresAt).getTime() <= now;
}

function emailWhereClause(): string {
  return "LOWER(TRIM(email)) = ?";
}

export async function findUserByEmail(email: string): Promise<DocumentationUser | null> {
  ensureMigrations();
  const normalized = normalizeEmail(email);
  const row = await runQueryOne(
    `SELECT * FROM documentation_users WHERE ${emailWhereClause()} LIMIT 1`,
    [normalized]
  );
  return row ? rowToUser(row) : null;
}

export async function findUserByAuth0Id(auth0UserId: string): Promise<DocumentationUser | null> {
  ensureMigrations();
  const row = await runQueryOne(
    "SELECT * FROM documentation_users WHERE auth0_user_id = ? LIMIT 1",
    [auth0UserId]
  );
  return row ? rowToUser(row) : null;
}

export async function findUserById(id: string): Promise<DocumentationUser | null> {
  ensureMigrations();
  const row = await runQueryOne("SELECT * FROM documentation_users WHERE id = ? LIMIT 1", [id]);
  return row ? rowToUser(row) : null;
}

export async function listUsers(): Promise<DocumentationUser[]> {
  ensureMigrations();
  const rows = await runQuery(
    "SELECT * FROM documentation_users ORDER BY created_at DESC"
  );
  return rows.map(rowToUser);
}

export async function findInviteByEmail(email: string): Promise<DocumentationInvite | null> {
  ensureMigrations();
  await markExpiredInvites();
  const normalized = normalizeEmail(email);
  const row = await runQueryOne(
    `SELECT * FROM documentation_invites WHERE ${emailWhereClause()} ORDER BY created_at DESC LIMIT 1`,
    [normalized]
  );
  return row ? rowToInvite(row) : null;
}

export async function findPendingInviteByEmail(email: string): Promise<DocumentationInvite | null> {
  ensureMigrations();
  await markExpiredInvites();
  const normalized = normalizeEmail(email);
  const row = await runQueryOne(
    `SELECT * FROM documentation_invites WHERE ${emailWhereClause()} AND status = 'pending' ORDER BY created_at DESC LIMIT 1`,
    [normalized]
  );
  return row ? rowToInvite(row) : null;
}

export async function findInviteByTokenHash(tokenHash: string): Promise<DocumentationInvite | null> {
  ensureMigrations();
  const row = await runQueryOne(
    "SELECT * FROM documentation_invites WHERE token_hash = ? LIMIT 1",
    [tokenHash]
  );
  return row ? rowToInvite(row) : null;
}

export async function findInviteByRawToken(rawToken: string): Promise<DocumentationInvite | null> {
  return findInviteByTokenHash(hashInviteToken(rawToken));
}

export async function listInvites(): Promise<DocumentationInvite[]> {
  ensureMigrations();
  await markExpiredInvites();
  const rows = await runQuery(
    "SELECT * FROM documentation_invites ORDER BY created_at DESC"
  );
  return rows.map(rowToInvite);
}

export function isValidPendingInvite(invite: DocumentationInvite, now = Date.now()): boolean {
  return invite.status === "pending" && !isExpired(invite, now);
}

export async function markExpiredInvites(): Promise<void> {
  ensureMigrations();
  const now = nowIso();
  await runExecute(
    "UPDATE documentation_invites SET status = 'expired', updated_at = ? WHERE status = 'pending' AND expires_at <= ?",
    [now, now]
  );
}

export async function createInvite(input: {
  email: string;
  role: DocumentationRole;
  invitedByUserId: string;
  expiryDays?: number;
}): Promise<{ invite: DocumentationInvite; rawToken: string }> {
  ensureMigrations();
  const normalized = normalizeEmail(input.email);
  const days = input.expiryDays ?? defaultExpiryDays();
  const expiresAt = inviteExpiryFromDays(days);
  const now = nowIso();

  await runExecute(
    `UPDATE documentation_invites SET status = 'revoked', updated_at = ? WHERE status = 'pending' AND ${emailWhereClause()}`,
    [now, normalized]
  );

  const { rawToken, tokenHash } = generateInviteToken();
  const id = randomUUID();
  await runExecute(
    `INSERT INTO documentation_invites (
      id, email, role, token_hash, status, invited_by_user_id, expires_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?)`,
    [id, normalized, input.role, tokenHash, input.invitedByUserId, expiresAt.toISOString(), now, now]
  );

  const invite = await runQueryOne("SELECT * FROM documentation_invites WHERE id = ?", [id]);
  return { invite: rowToInvite(invite!), rawToken };
}

export async function acceptInvite(inviteId: string): Promise<DocumentationInvite | null> {
  ensureMigrations();
  const now = nowIso();
  await runExecute(
    "UPDATE documentation_invites SET status = 'accepted', accepted_at = ?, updated_at = ? WHERE id = ? AND status = 'pending'",
    [now, now, inviteId]
  );
  const row = await runQueryOne("SELECT * FROM documentation_invites WHERE id = ?", [inviteId]);
  return row ? rowToInvite(row) : null;
}

export async function revokeInvite(id: string): Promise<DocumentationInvite | null> {
  ensureMigrations();
  const now = nowIso();
  await runExecute(
    "UPDATE documentation_invites SET status = 'revoked', updated_at = ? WHERE id = ? AND status = 'pending'",
    [now, id]
  );
  const row = await runQueryOne("SELECT * FROM documentation_invites WHERE id = ?", [id]);
  return row ? rowToInvite(row) : null;
}

export async function resendInvite(
  id: string,
  expiryDays?: number
): Promise<{ invite: DocumentationInvite; rawToken: string } | null> {
  ensureMigrations();
  const existing = await runQueryOne(
    "SELECT * FROM documentation_invites WHERE id = ? AND status = 'pending' LIMIT 1",
    [id]
  );
  if (!existing) return null;

  const days = expiryDays ?? defaultExpiryDays();
  const expiresAt = inviteExpiryFromDays(days);
  const { rawToken, tokenHash } = generateInviteToken();
  const now = nowIso();

  await runExecute(
    "UPDATE documentation_invites SET token_hash = ?, expires_at = ?, updated_at = ? WHERE id = ?",
    [tokenHash, expiresAt.toISOString(), now, id]
  );

  const row = await runQueryOne("SELECT * FROM documentation_invites WHERE id = ?", [id]);
  return row ? { invite: rowToInvite(row), rawToken } : null;
}

export async function createUserFromInvite(input: {
  auth0UserId: string;
  email: string;
  name?: string | null;
  picture?: string | null;
  role: DocumentationRole;
  invitedByUserId?: string | null;
}): Promise<DocumentationUser> {
  ensureMigrations();
  const now = nowIso();
  const id = randomUUID();
  const normalized = normalizeEmail(input.email);

  await runExecute(
    `INSERT INTO documentation_users (
      id, auth0_user_id, email, name, picture, role, status,
      invited_by_user_id, accepted_invite_at, last_login_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?)`,
    [
      id,
      input.auth0UserId,
      normalized,
      input.name ?? null,
      input.picture ?? null,
      input.role,
      input.invitedByUserId ?? null,
      now,
      now,
      now,
      now,
    ]
  );

  const row = await runQueryOne("SELECT * FROM documentation_users WHERE id = ?", [id]);
  return rowToUser(row!);
}

export async function updateUserOnLogin(input: {
  auth0UserId: string;
  email: string;
  name?: string | null;
  picture?: string | null;
}): Promise<DocumentationUser | null> {
  ensureMigrations();
  const existing = await findUserByAuth0Id(input.auth0UserId);
  if (!existing) return null;
  const now = nowIso();
  await runExecute(
    `UPDATE documentation_users SET email = ?, name = ?, picture = ?, last_login_at = ?, updated_at = ? WHERE auth0_user_id = ?`,
    [
      normalizeEmail(input.email),
      input.name ?? existing.name ?? null,
      input.picture ?? existing.picture ?? null,
      now,
      now,
      input.auth0UserId,
    ]
  );
  return findUserByAuth0Id(input.auth0UserId);
}

export async function updateUserRole(
  userId: string,
  role: DocumentationRole
): Promise<DocumentationUser | null> {
  ensureMigrations();
  if (!isDocumentationRole(role)) return null;
  const user = await findUserById(userId);
  if (!user) return null;

  if (user.role === "owner" && role !== "owner") {
    const owners = (await listUsers()).filter(
      (u) => u.role === "owner" && u.status === "active"
    );
    if (owners.length <= 1) {
      throw new Error("Cannot demote the last active owner");
    }
  }

  const now = nowIso();
  await runExecute(
    "UPDATE documentation_users SET role = ?, updated_at = ? WHERE id = ?",
    [role, now, userId]
  );
  return findUserById(userId);
}

export async function disableUser(userId: string): Promise<DocumentationUser | null> {
  ensureMigrations();
  const user = await findUserById(userId);
  if (!user) return null;

  if (user.role === "owner") {
    const owners = (await listUsers()).filter(
      (u) => u.role === "owner" && u.status === "active"
    );
    if (owners.length <= 1) {
      throw new Error("Cannot disable the last active owner");
    }
  }

  const now = nowIso();
  await runExecute(
    "UPDATE documentation_users SET status = 'disabled', updated_at = ? WHERE id = ?",
    [now, userId]
  );
  return findUserById(userId);
}

export async function appendAuditLog(input: {
  action: string;
  userId?: string | null;
  actorEmail?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<DocumentationAuditLog> {
  ensureMigrations();
  const id = randomUUID();
  const now = nowIso();
  const metadataJson = input.metadata ? JSON.stringify(sanitizeMetadata(input.metadata)) : null;

  await runExecute(
    `INSERT INTO documentation_audit_logs (id, action, user_id, actor_email, metadata, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, input.action, input.userId ?? null, input.actorEmail ?? null, metadataJson, now]
  );

  return {
    id,
    action: input.action,
    userId: input.userId ?? null,
    actorEmail: input.actorEmail ?? null,
    metadata: input.metadata ?? null,
    createdAt: now,
  };
}

function sanitizeMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
  const blocked = new Set([
    "token",
    "rawToken",
    "inviteToken",
    "accessToken",
    "refreshToken",
    "secret",
    "password",
    "signature",
  ]);
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (blocked.has(key)) continue;
    out[key] = value;
  }
  return out;
}

export async function listAuditLogs(limit = 100): Promise<DocumentationAuditLog[]> {
  ensureMigrations();
  const rows = await runQuery(
    "SELECT * FROM documentation_audit_logs ORDER BY created_at DESC LIMIT ?",
    [limit]
  );
  return rows.map(rowToAudit);
}

export function buildInviteUrl(rawToken: string, baseUrl: string): string {
  const url = new URL("/invite", baseUrl.replace(/\/$/, ""));
  url.searchParams.set("token", rawToken);
  return url.toString();
}

/** Wipe all auth tables — tests only. */
export async function clearAllDocumentationAuthData(): Promise<void> {
  ensureMigrations();
  await runExecute("DELETE FROM documentation_audit_logs");
  await runExecute("DELETE FROM documentation_invites");
  await runExecute("DELETE FROM documentation_users");
}

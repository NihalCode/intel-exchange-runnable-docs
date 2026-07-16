import "server-only";

import { randomBytes } from "node:crypto";

import { db } from "@/lib/db/client";
import { normalizeHostname } from "@/lib/domains/normalize";

const TTL_MS = 5 * 60 * 1000;

export interface AuthReturnTarget {
  id: string;
  targetHostname: string;
  returnPath: string;
  organizationId: string | null;
  expiresAt: string;
}

export async function createAuthReturnTarget(input: {
  targetHostname: string;
  returnPath: string;
  organizationId?: string | null;
}): Promise<string> {
  const normalized = normalizeHostname(input.targetHostname);
  if (!normalized.ok) throw new Error(normalized.error.message);
  const path = input.returnPath.trim();
  if (!path.startsWith("/") || path.startsWith("//")) {
    throw new Error("Invalid return path");
  }
  const id = randomBytes(24).toString("base64url");
  const expiresAt = new Date(Date.now() + TTL_MS).toISOString();
  await db.execute(
    `INSERT INTO auth_return_targets (id, target_hostname, return_path, organization_id, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      id,
      normalized.hostname,
      path,
      input.organizationId ?? null,
      expiresAt,
      new Date().toISOString(),
    ]
  );
  return id;
}

export async function consumeAuthReturnTarget(id: string): Promise<AuthReturnTarget | null> {
  const row = await db.queryOne<Record<string, unknown>>(
    `SELECT * FROM auth_return_targets WHERE id = ?`,
    [id]
  );
  if (!row) return null;
  await db.execute(`DELETE FROM auth_return_targets WHERE id = ?`, [id]);
  if (new Date(String(row.expires_at)) <= new Date()) return null;
  return {
    id: String(row.id),
    targetHostname: String(row.target_hostname),
    returnPath: String(row.return_path),
    organizationId: row.organization_id == null ? null : String(row.organization_id),
    expiresAt: String(row.expires_at),
  };
}

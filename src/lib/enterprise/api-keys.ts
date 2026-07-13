import "server-only";

import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";

import {
  db,
  type DbExecutor,
  withOrganizationTransaction,
} from "@/lib/db/client";
import type { EnterpriseEnvironment } from "@/lib/enterprise/types";

export interface ApiCredentialMetadata {
  id: string;
  organizationId: string;
  name: string;
  environment: EnterpriseEnvironment;
  keyHash: string;
  vaultRef: string | null;
  last4: string;
  status: "active" | "revoked" | "expired" | "rotated";
  expiresAt: string | null;
  revokedAt: string | null;
  rotatedAt: string | null;
  rotatedFromId: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface OneTimeApiKey {
  plaintext: string;
  metadata: Omit<ApiCredentialMetadata, "keyHash">;
}

export function hashApiKey(plaintext: string): string {
  return createHash("sha256").update(plaintext, "utf8").digest("hex");
}

export function generateApiKey(): string {
  return `ix_${randomBytes(32).toString("base64url")}`;
}

function rowToMetadata(row: Record<string, unknown>): ApiCredentialMetadata {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    name: String(row.name),
    environment: row.environment as EnterpriseEnvironment,
    keyHash: String(row.key_hash),
    vaultRef: row.vault_ref == null ? null : String(row.vault_ref),
    last4: String(row.last4),
    status: row.status as ApiCredentialMetadata["status"],
    expiresAt: row.expires_at == null ? null : String(row.expires_at),
    revokedAt: row.revoked_at == null ? null : String(row.revoked_at),
    rotatedAt: row.rotated_at == null ? null : String(row.rotated_at),
    rotatedFromId:
      row.rotated_from_id == null ? null : String(row.rotated_from_id),
    version: Number(row.version),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

async function findById(
  organizationId: string,
  id: string,
  executor: DbExecutor = db
): Promise<ApiCredentialMetadata | null> {
  const row = await executor.queryOne(
    "SELECT * FROM api_credential_metadata WHERE organization_id = ? AND id = ? LIMIT 1",
    [organizationId, id]
  );
  return row ? rowToMetadata(row) : null;
}

export async function listApiKeyMetadata(
  organizationId: string,
  executor: DbExecutor = db
): Promise<Array<Omit<ApiCredentialMetadata, "keyHash" | "vaultRef">>> {
  const rows = await executor.query(
    `SELECT * FROM api_credential_metadata
     WHERE organization_id = ? ORDER BY created_at DESC`,
    [organizationId]
  );
  return rows.map((row) => {
    const { keyHash: _hash, vaultRef: _vault, ...safe } = rowToMetadata(row);
    void _hash;
    void _vault;
    return safe;
  });
}

export async function findApiKeyMetadata(
  organizationId: string,
  id: string,
  executor: DbExecutor = db
): Promise<Omit<ApiCredentialMetadata, "keyHash" | "vaultRef"> | null> {
  const result = await findById(organizationId, id, executor);
  if (!result) return null;
  const { keyHash: _hash, vaultRef: _vault, ...safe } = result;
  void _hash;
  void _vault;
  return safe;
}

async function insertApiKey(
  input: {
    organizationId: string;
    name: string;
    environment: EnterpriseEnvironment;
    createdByUserId: string;
    expiresAt?: string | null;
    vaultRef?: string | null;
    rotatedFromId?: string | null;
  },
  executor: DbExecutor
): Promise<OneTimeApiKey> {
  const plaintext = generateApiKey();
  const keyHash = hashApiKey(plaintext);
  const id = randomUUID();
  const now = new Date().toISOString();
  await executor.execute(
    `INSERT INTO api_credential_metadata (
      id, organization_id, name, environment, key_hash, vault_ref, last4,
      status, expires_at, rotated_from_id, created_by_user_id,
      version, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, 1, ?, ?)`,
    [
      id,
      input.organizationId,
      input.name,
      input.environment,
      keyHash,
      input.vaultRef ?? null,
      plaintext.slice(-4),
      input.expiresAt ?? null,
      input.rotatedFromId ?? null,
      input.createdByUserId,
      now,
      now,
    ]
  );
  const stored = (await findById(input.organizationId, id, executor))!;
  const { keyHash: _neverReturnHash, ...metadata } = stored;
  void _neverReturnHash;
  return { plaintext, metadata };
}

export async function createApiKey(input: {
  organizationId: string;
  name: string;
  environment: EnterpriseEnvironment;
  createdByUserId: string;
  expiresAt?: string | null;
  vaultRef?: string | null;
}): Promise<OneTimeApiKey> {
  return withOrganizationTransaction(
    { organizationId: input.organizationId, userId: input.createdByUserId },
    (transaction) => insertApiKey(input, transaction)
  );
}

export async function verifyApiKey(
  organizationId: string,
  plaintext: string,
  userId = "api-key-verifier"
): Promise<ApiCredentialMetadata | null> {
  const candidate = hashApiKey(plaintext);
  return withOrganizationTransaction(
    { organizationId, userId },
    async (transaction) => {
      const row = await transaction.queryOne(
        `SELECT * FROM api_credential_metadata
         WHERE organization_id = ? AND key_hash = ? AND status = 'active' LIMIT 1`,
        [organizationId, candidate]
      );
      if (!row) return null;
      const metadata = rowToMetadata(row);
      if (
        metadata.expiresAt &&
        new Date(metadata.expiresAt).getTime() <= Date.now()
      ) {
        return null;
      }
      const stored = Buffer.from(metadata.keyHash, "hex");
      const provided = Buffer.from(candidate, "hex");
      return stored.length === provided.length &&
        timingSafeEqual(stored, provided)
        ? metadata
        : null;
    }
  );
}

export async function revokeApiKey(input: {
  organizationId: string;
  credentialId: string;
  actorUserId: string;
  expectedVersion: number;
}): Promise<void> {
  await withOrganizationTransaction(
    { organizationId: input.organizationId, userId: input.actorUserId },
    async (transaction) => {
      const now = new Date().toISOString();
      await transaction.execute(
        `UPDATE api_credential_metadata
         SET status = 'revoked', revoked_at = ?, version = version + 1, updated_at = ?
         WHERE organization_id = ? AND id = ? AND status = 'active' AND version = ?`,
        [
          now,
          now,
          input.organizationId,
          input.credentialId,
          input.expectedVersion,
        ]
      );
      const updated = await findById(
        input.organizationId,
        input.credentialId,
        transaction
      );
      if (updated?.status !== "revoked") {
        throw new Error("Credential changed; reload and retry");
      }
    }
  );
}

export async function rotateApiKey(input: {
  organizationId: string;
  credentialId: string;
  actorUserId: string;
  expectedVersion: number;
  newName?: string;
}): Promise<OneTimeApiKey> {
  return withOrganizationTransaction(
    { organizationId: input.organizationId, userId: input.actorUserId },
    async (transaction) => {
      const existing = await findById(
        input.organizationId,
        input.credentialId,
        transaction
      );
      if (
        !existing ||
        existing.status !== "active" ||
        existing.version !== input.expectedVersion
      ) {
        throw new Error("Credential changed; reload and retry");
      }
      const now = new Date().toISOString();
      await transaction.execute(
        `UPDATE api_credential_metadata
         SET status = 'rotated', rotated_at = ?, version = version + 1, updated_at = ?
         WHERE organization_id = ? AND id = ? AND status = 'active' AND version = ?`,
        [
          now,
          now,
          input.organizationId,
          input.credentialId,
          input.expectedVersion,
        ]
      );
      return insertApiKey(
        {
          organizationId: input.organizationId,
          name: input.newName ?? `${existing.name}-${Date.now()}`,
          environment: existing.environment,
          createdByUserId: input.actorUserId,
          expiresAt: existing.expiresAt,
          vaultRef: existing.vaultRef,
          rotatedFromId: existing.id,
        },
        transaction
      );
    }
  );
}

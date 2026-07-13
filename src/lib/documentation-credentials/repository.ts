import "server-only";

import { randomUUID } from "node:crypto";

import { db, withOrganizationTransaction } from "@/lib/db/client";
import type {
  CredentialMetadata,
  CredentialStatus,
  DocumentationProduct,
  StoredCredential,
} from "@/lib/documentation-credentials/types";

function parseArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  try {
    const parsed = JSON.parse(String(value ?? "[]"));
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function fromRow(row: Record<string, unknown>): StoredCredential {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    userId: String(row.user_id),
    productId: row.product_id as DocumentationProduct,
    baseUrl: String(row.base_url),
    accessIdMasked: String(row.access_id_masked),
    secretCiphertext: row.secret_ciphertext == null ? null : String(row.secret_ciphertext),
    secretIv: row.secret_iv == null ? null : String(row.secret_iv),
    secretTag: row.secret_tag == null ? null : String(row.secret_tag),
    vaultRef: row.vault_ref == null ? null : String(row.vault_ref),
    status: row.status as CredentialStatus,
    authorizedScopes: parseArray(row.authorized_scopes_json),
    validatedAt: row.validated_at == null ? null : String(row.validated_at),
    expiresAt: row.expires_at == null ? null : String(row.expires_at),
    validationErrorCode:
      row.validation_error_code == null ? null : String(row.validation_error_code),
    version: Number(row.version),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export function toCredentialMetadata(value: StoredCredential): CredentialMetadata {
  return {
    id: value.id,
    organizationId: value.organizationId,
    userId: value.userId,
    productId: value.productId,
    baseUrl: value.baseUrl,
    accessIdMasked: value.accessIdMasked,
    status: value.status,
    authorizedScopes: value.authorizedScopes,
    validatedAt: value.validatedAt,
    expiresAt: value.expiresAt,
    validationErrorCode: value.validationErrorCode,
    version: value.version,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

export async function listCredentialMetadata(
  organizationId: string,
  userId: string
): Promise<CredentialMetadata[]> {
  const rows = await db.query(
    `SELECT * FROM user_product_credentials
     WHERE organization_id = ? AND user_id = ? ORDER BY product_id`,
    [organizationId, userId]
  );
  return rows.map(fromRow).map(toCredentialMetadata);
}

export async function findStoredCredential(
  organizationId: string,
  userId: string,
  productId: DocumentationProduct
): Promise<StoredCredential | null> {
  const row = await db.queryOne(
    `SELECT * FROM user_product_credentials
     WHERE organization_id = ? AND user_id = ? AND product_id = ?`,
    [organizationId, userId, productId]
  );
  return row ? fromRow(row) : null;
}

export async function hasValidCredential(
  organizationId: string,
  userId: string,
  now = new Date()
): Promise<boolean> {
  await db.execute(
    `UPDATE user_product_credentials SET status = 'expired', version = version + 1,
     updated_at = ? WHERE organization_id = ? AND user_id = ? AND status = 'valid'
     AND expires_at IS NOT NULL AND expires_at <= ?`,
    [now.toISOString(), organizationId, userId, now.toISOString()]
  );
  const row = await db.queryOne<{ id: string }>(
    `SELECT id FROM user_product_credentials
     WHERE organization_id = ? AND user_id = ? AND status = 'valid'
       AND (expires_at IS NULL OR expires_at > ?) LIMIT 1`,
    [organizationId, userId, now.toISOString()]
  );
  return Boolean(row);
}

export async function upsertCredential(input: {
  organizationId: string;
  userId: string;
  productId: DocumentationProduct;
  baseUrl: string;
  accessIdMasked: string;
  secretCiphertext: string;
  secretIv: string;
  secretTag: string;
  status: CredentialStatus;
  authorizedScopes?: string[];
  validatedAt?: string | null;
  expiresAt?: string | null;
  validationErrorCode?: string | null;
}): Promise<CredentialMetadata> {
  return withOrganizationTransaction(
    { organizationId: input.organizationId, userId: input.userId },
    async (tx) => {
      const existing = await tx.queryOne<{ id: string; version: number; created_at: string }>(
        `SELECT id, version, created_at FROM user_product_credentials
         WHERE organization_id = ? AND user_id = ? AND product_id = ?`,
        [input.organizationId, input.userId, input.productId]
      );
      const now = new Date().toISOString();
      if (existing) {
        await tx.execute(
          `UPDATE user_product_credentials SET base_url = ?, access_id_masked = ?,
           secret_ciphertext = ?, secret_iv = ?, secret_tag = ?, vault_ref = NULL,
           status = ?, authorized_scopes_json = ?, validated_at = ?, expires_at = ?,
           validation_error_code = ?, version = version + 1, updated_at = ?
           WHERE id = ? AND organization_id = ? AND user_id = ?`,
          [
            input.baseUrl,
            input.accessIdMasked,
            input.secretCiphertext,
            input.secretIv,
            input.secretTag,
            input.status,
            JSON.stringify(input.authorizedScopes ?? []),
            input.validatedAt ?? null,
            input.expiresAt ?? null,
            input.validationErrorCode ?? null,
            now,
            existing.id,
            input.organizationId,
            input.userId,
          ]
        );
      } else {
        await tx.execute(
          `INSERT INTO user_product_credentials (
            id, organization_id, user_id, product_id, base_url, access_id_masked,
            secret_ciphertext, secret_iv, secret_tag, status, authorized_scopes_json,
            validated_at, expires_at, validation_error_code, version, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
          [
            randomUUID(),
            input.organizationId,
            input.userId,
            input.productId,
            input.baseUrl,
            input.accessIdMasked,
            input.secretCiphertext,
            input.secretIv,
            input.secretTag,
            input.status,
            JSON.stringify(input.authorizedScopes ?? []),
            input.validatedAt ?? null,
            input.expiresAt ?? null,
            input.validationErrorCode ?? null,
            now,
            now,
          ]
        );
      }
      const saved = await tx.queryOne(
        `SELECT * FROM user_product_credentials
         WHERE organization_id = ? AND user_id = ? AND product_id = ?`,
        [input.organizationId, input.userId, input.productId]
      );
      return toCredentialMetadata(fromRow(saved!));
    }
  );
}

export async function markCredentialStatus(
  organizationId: string,
  userId: string,
  productId: DocumentationProduct,
  status: CredentialStatus,
  validationErrorCode: string | null = null
): Promise<void> {
  await db.execute(
    `UPDATE user_product_credentials SET status = ?, validation_error_code = ?,
     version = version + 1, updated_at = ?
     WHERE organization_id = ? AND user_id = ? AND product_id = ?`,
    [
      status,
      validationErrorCode,
      new Date().toISOString(),
      organizationId,
      userId,
      productId,
    ]
  );
}

export async function revokeCredential(
  organizationId: string,
  userId: string,
  productId: DocumentationProduct
): Promise<boolean> {
  const existing = await findStoredCredential(organizationId, userId, productId);
  if (!existing) return false;
  await db.execute(
    `UPDATE user_product_credentials SET status = 'revoked', secret_ciphertext = NULL,
     secret_iv = NULL, secret_tag = NULL, vault_ref = NULL, version = version + 1,
     updated_at = ? WHERE organization_id = ? AND user_id = ? AND product_id = ?`,
    [new Date().toISOString(), organizationId, userId, productId]
  );
  return true;
}

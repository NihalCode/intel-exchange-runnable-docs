import "server-only";

import { randomUUID } from "node:crypto";

import { db, withOrganizationTransaction } from "@/lib/db/client";

export const DOCUMENTATION_FEATURE_KEYS = [
  "ai_documentation_assistant",
  "app_builder",
  "project_workspace",
  "preview",
  "vercel_deployment",
  "git_commit",
  "project_download",
  "vercel_import",
  "api_testing_console",
  "generated_code_examples",
  "public_changelog",
  "public_documentation_search",
] as const;

export type DocumentationFeatureKey = (typeof DOCUMENTATION_FEATURE_KEYS)[number];

const DEFAULT_ENABLED = new Set<DocumentationFeatureKey>([
  "ai_documentation_assistant",
  "generated_code_examples",
  "public_changelog",
  "public_documentation_search",
]);

export function defaultDocumentationFeatureEnabled(
  key: DocumentationFeatureKey
): boolean {
  return DEFAULT_ENABLED.has(key);
}

export interface DocumentationFeatureFlag {
  key: DocumentationFeatureKey;
  enabled: boolean;
  allowedEnvironments: string[];
  allowedRoles: string[];
  version: number;
  modifiedBy: string | null;
  modifiedAt: string | null;
}

function parseArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  try {
    const result = JSON.parse(String(value ?? "[]"));
    return Array.isArray(result) ? result.map(String) : [];
  } catch {
    return [];
  }
}

function defaultFlag(key: DocumentationFeatureKey): DocumentationFeatureFlag {
  return {
    key,
    enabled: defaultDocumentationFeatureEnabled(key),
    allowedEnvironments: [],
    allowedRoles: [],
    version: 0,
    modifiedBy: null,
    modifiedAt: null,
  };
}

export function isDocumentationFeatureKey(value: string): value is DocumentationFeatureKey {
  return DOCUMENTATION_FEATURE_KEYS.includes(value as DocumentationFeatureKey);
}

export async function listDocumentationFeatures(
  organizationId: string
): Promise<DocumentationFeatureFlag[]> {
  const rows = await db.query(
    "SELECT * FROM documentation_feature_flags WHERE organization_id = ?",
    [organizationId]
  );
  const stored = new Map(
    rows.map((row) => [
      String(row.key),
      {
        key: row.key as DocumentationFeatureKey,
        enabled: row.enabled === true || row.enabled === 1 || row.enabled === "1",
        allowedEnvironments: parseArray(row.allowed_environments_json),
        allowedRoles: parseArray(row.allowed_roles_json),
        version: Number(row.version),
        modifiedBy: String(row.modified_by),
        modifiedAt: String(row.updated_at),
      } satisfies DocumentationFeatureFlag,
    ])
  );
  return DOCUMENTATION_FEATURE_KEYS.map((key) => stored.get(key) ?? defaultFlag(key));
}

export async function getDocumentationFeature(
  organizationId: string,
  key: DocumentationFeatureKey
): Promise<DocumentationFeatureFlag> {
  const flags = await listDocumentationFeatures(organizationId);
  return flags.find((flag) => flag.key === key)!;
}

export async function isDocumentationFeatureEnabled(input: {
  organizationId: string;
  key: DocumentationFeatureKey;
  role?: string;
  environment?: string;
}): Promise<boolean> {
  const flag = await getDocumentationFeature(input.organizationId, input.key);
  if (!flag.enabled) return false;
  if (flag.allowedRoles.length && (!input.role || !flag.allowedRoles.includes(input.role))) {
    return false;
  }
  if (
    flag.allowedEnvironments.length &&
    (!input.environment || !flag.allowedEnvironments.includes(input.environment))
  ) {
    return false;
  }
  return true;
}

export async function updateDocumentationFeature(input: {
  organizationId: string;
  userId: string;
  key: DocumentationFeatureKey;
  enabled: boolean;
  allowedEnvironments: string[];
  allowedRoles: string[];
  expectedVersion?: number;
}): Promise<DocumentationFeatureFlag> {
  return withOrganizationTransaction(
    { organizationId: input.organizationId, userId: input.userId },
    async (tx) => {
      const current = await tx.queryOne<{ id: string; version: number }>(
        `SELECT id, version FROM documentation_feature_flags
         WHERE organization_id = ? AND key = ?`,
        [input.organizationId, input.key]
      );
      const now = new Date().toISOString();
      if (current) {
        if (
          input.expectedVersion !== undefined &&
          current.version !== input.expectedVersion
        ) {
          throw new Error("VERSION_CONFLICT");
        }
        await tx.execute(
          `UPDATE documentation_feature_flags SET enabled = ?,
           allowed_environments_json = ?, allowed_roles_json = ?,
           modified_by = ?, version = version + 1, updated_at = ?
           WHERE id = ? AND organization_id = ?`,
          [
            input.enabled ? 1 : 0,
            JSON.stringify(input.allowedEnvironments),
            JSON.stringify(input.allowedRoles),
            input.userId,
            now,
            current.id,
            input.organizationId,
          ]
        );
      } else {
        await tx.execute(
          `INSERT INTO documentation_feature_flags (
            id, organization_id, key, enabled, allowed_environments_json,
            allowed_roles_json, version, modified_by, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
          [
            randomUUID(),
            input.organizationId,
            input.key,
            input.enabled ? 1 : 0,
            JSON.stringify(input.allowedEnvironments),
            JSON.stringify(input.allowedRoles),
            input.userId,
            now,
            now,
          ]
        );
      }
      return getDocumentationFeature(input.organizationId, input.key);
    }
  );
}

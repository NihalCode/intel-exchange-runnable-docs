import "server-only";

import {
  db,
  type DbExecutor,
  withOrganizationTransaction,
} from "@/lib/db/client";
import { redactStructuredValue } from "@/lib/enterprise/observability";

export interface OrganizationSecuritySettings {
  mfaRequired: boolean;
  outboundUrlValidationEnabled: boolean;
  auditRetentionDays: number;
  emergencyOverrideRequiresReason: boolean;
}

export interface SecuritySettingsRecord {
  organizationId: string;
  settings: OrganizationSecuritySettings;
  version: number;
  updatedAt: string;
}

export const DEFAULT_SECURITY_SETTINGS: OrganizationSecuritySettings = {
  mfaRequired: true,
  outboundUrlValidationEnabled: true,
  auditRetentionDays: 90,
  emergencyOverrideRequiresReason: true,
};

const MIN_AUDIT_RETENTION_DAYS = 7;
const MAX_AUDIT_RETENTION_DAYS = 3650;

function parseSettings(value: unknown): OrganizationSecuritySettings {
  const raw =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const retention = Number(raw.auditRetentionDays);
  return {
    mfaRequired: raw.mfaRequired !== false,
    outboundUrlValidationEnabled: raw.outboundUrlValidationEnabled !== false,
    auditRetentionDays:
      Number.isFinite(retention) &&
      retention >= MIN_AUDIT_RETENTION_DAYS &&
      retention <= MAX_AUDIT_RETENTION_DAYS
        ? Math.floor(retention)
        : DEFAULT_SECURITY_SETTINGS.auditRetentionDays,
    emergencyOverrideRequiresReason: raw.emergencyOverrideRequiresReason !== false,
  };
}

export function sanitizeSecuritySettingsPatch(
  value: Record<string, unknown>
): Partial<OrganizationSecuritySettings> {
  const patch: Partial<OrganizationSecuritySettings> = {};
  if ("mfaRequired" in value) {
    if (typeof value.mfaRequired !== "boolean") {
      throw new SecuritySettingsValidationError("mfaRequired must be a boolean");
    }
    patch.mfaRequired = value.mfaRequired;
  }
  if ("outboundUrlValidationEnabled" in value) {
    if (typeof value.outboundUrlValidationEnabled !== "boolean") {
      throw new SecuritySettingsValidationError(
        "outboundUrlValidationEnabled must be a boolean"
      );
    }
    patch.outboundUrlValidationEnabled = value.outboundUrlValidationEnabled;
  }
  if ("auditRetentionDays" in value) {
    const days = value.auditRetentionDays;
    if (!Number.isInteger(days) || Number(days) < MIN_AUDIT_RETENTION_DAYS) {
      throw new SecuritySettingsValidationError(
        `auditRetentionDays must be an integer between ${MIN_AUDIT_RETENTION_DAYS} and ${MAX_AUDIT_RETENTION_DAYS}`
      );
    }
    if (Number(days) > MAX_AUDIT_RETENTION_DAYS) {
      throw new SecuritySettingsValidationError(
        `auditRetentionDays must be an integer between ${MIN_AUDIT_RETENTION_DAYS} and ${MAX_AUDIT_RETENTION_DAYS}`
      );
    }
    patch.auditRetentionDays = Number(days);
  }
  if ("emergencyOverrideRequiresReason" in value) {
    if (typeof value.emergencyOverrideRequiresReason !== "boolean") {
      throw new SecuritySettingsValidationError(
        "emergencyOverrideRequiresReason must be a boolean"
      );
    }
    patch.emergencyOverrideRequiresReason = value.emergencyOverrideRequiresReason;
  }
  return patch;
}

export class SecuritySettingsValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SecuritySettingsValidationError";
  }
}

function rowToRecord(row: Record<string, unknown>): SecuritySettingsRecord {
  let settingsRaw: unknown = row.settings_json;
  if (typeof settingsRaw === "string") {
    try {
      settingsRaw = JSON.parse(settingsRaw);
    } catch {
      settingsRaw = {};
    }
  }
  return {
    organizationId: String(row.organization_id),
    settings: parseSettings(settingsRaw),
    version: Number(row.version),
    updatedAt: String(row.updated_at),
  };
}

export async function getSecuritySettings(
  organizationId: string,
  executor: DbExecutor = db
): Promise<SecuritySettingsRecord> {
  const row = await executor.queryOne(
    `SELECT organization_id, settings_json, version, updated_at
     FROM organization_security_settings
     WHERE organization_id = ? LIMIT 1`,
    [organizationId]
  );
  if (!row) {
    return {
      organizationId,
      settings: { ...DEFAULT_SECURITY_SETTINGS },
      version: 0,
      updatedAt: new Date(0).toISOString(),
    };
  }
  return rowToRecord(row);
}

export async function upsertSecuritySettings(
  input: {
    organizationId: string;
    actorUserId: string;
    patch: Partial<OrganizationSecuritySettings>;
    expectedVersion: number;
  },
  executor: DbExecutor = db
): Promise<SecuritySettingsRecord> {
  const current = await getSecuritySettings(input.organizationId, executor);
  if (current.version !== input.expectedVersion) {
    throw new SecuritySettingsVersionError();
  }
  const merged: OrganizationSecuritySettings = {
    ...current.settings,
    ...input.patch,
  };
  const sanitized = parseSettings(redactStructuredValue(merged));
  const now = new Date().toISOString();
  if (current.version === 0) {
    await executor.execute(
      `INSERT INTO organization_security_settings (
        organization_id, settings_json, version, updated_at
      ) VALUES (?, ?, 1, ?)`,
      [input.organizationId, JSON.stringify(sanitized), now]
    );
  } else {
    await executor.execute(
      `UPDATE organization_security_settings
       SET settings_json = ?, version = version + 1, updated_at = ?
       WHERE organization_id = ? AND version = ?`,
      [JSON.stringify(sanitized), now, input.organizationId, input.expectedVersion]
    );
  }
  const updated = await getSecuritySettings(input.organizationId, executor);
  if (updated.version !== input.expectedVersion + 1) {
    throw new SecuritySettingsVersionError();
  }
  return updated;
}

export async function updateSecuritySettings(
  input: {
    organizationId: string;
    actorUserId: string;
    patch: Partial<OrganizationSecuritySettings>;
    expectedVersion: number;
  }
): Promise<SecuritySettingsRecord> {
  return withOrganizationTransaction(
    { organizationId: input.organizationId, userId: input.actorUserId },
    (transaction) => upsertSecuritySettings(input, transaction)
  );
}

export class SecuritySettingsVersionError extends Error {
  constructor() {
    super("Security settings changed; reload and retry");
    this.name = "SecuritySettingsVersionError";
  }
}

import { randomUUID } from "node:crypto";

export const ENTERPRISE_AUDIT_ACTIONS = {
  organizationBootstrapped: "organization.bootstrapped",
  adminDashboardAccessed: "admin.dashboard_accessed",
  resourceCreated: "control_plane.resource_created",
  configVersionCreated: "control_plane.config_version_created",
  changeCreated: "change_request.created",
  changeSubmitted: "change_request.submitted",
  changeApproved: "change_request.approved",
  changeRejected: "change_request.rejected",
  changeScheduled: "change_request.scheduled",
  changeDeploying: "change_request.deploying",
  changeActivated: "change_request.activated",
  changeRolledBack: "change_request.rolled_back",
  apiKeyCreated: "api_key.created",
  apiKeyRevoked: "api_key.revoked",
  apiKeyRotated: "api_key.rotated",
  authorizationDenied: "authorization.denied",
} as const;

export type EnterpriseAuditAction =
  (typeof ENTERPRISE_AUDIT_ACTIONS)[keyof typeof ENTERPRISE_AUDIT_ACTIONS];

const SAFE_ID = /^[a-zA-Z0-9._:/-]{1,128}$/;

export function correlationIds(headers?: Headers): {
  correlationId: string;
  requestId: string;
} {
  const suppliedCorrelation = headers?.get("x-correlation-id")?.trim();
  const suppliedRequest = headers?.get("x-request-id")?.trim();
  return {
    correlationId:
      suppliedCorrelation && SAFE_ID.test(suppliedCorrelation)
        ? suppliedCorrelation
        : randomUUID(),
    requestId:
      suppliedRequest && SAFE_ID.test(suppliedRequest)
        ? suppliedRequest
        : randomUUID(),
  };
}

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface StructuredLogger {
  log(
    level: LogLevel,
    message: string,
    fields?: Record<string, unknown>
  ): void;
}

export class JsonConsoleLogger implements StructuredLogger {
  log(
    level: LogLevel,
    message: string,
    fields: Record<string, unknown> = {}
  ): void {
    const record = JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      message,
      ...redactStructuredValue(fields),
    });
    if (level === "error") console.error(record);
    else if (level === "warn") console.warn(record);
    else console.info(record);
  }
}

const SENSITIVE_KEY =
  /(authorization|cookie|token|secret|password|signature|api[-_]?key|credential|private[-_]?key)/i;
const SECRET_VALUE =
  /(bearer\s+[a-z0-9._~+/-]+=*|ix_[a-z0-9_-]{16,}|-----BEGIN [A-Z ]+PRIVATE KEY-----)/gi;

export function redactStructuredValue<T>(value: T, depth = 0): T {
  if (depth > 12) return "[REDACTED]" as T;
  if (typeof value === "string") {
    return value.replace(SECRET_VALUE, "[REDACTED]") as T;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => redactStructuredValue(entry, depth + 1)) as T;
  }
  if (value && typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      output[key] = SENSITIVE_KEY.test(key)
        ? "[REDACTED]"
        : redactStructuredValue(entry, depth + 1);
    }
    return output as T;
  }
  return value;
}

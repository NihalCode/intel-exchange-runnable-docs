import "server-only";

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import type { EnterpriseAccess } from "@/lib/enterprise/guard";
import { validateMutationCsrf } from "@/lib/enterprise/csrf";
import { appendEnterpriseAuditEvent } from "@/lib/enterprise/audit";
import { correlationIds } from "@/lib/enterprise/observability";
import { checkEnterpriseMutationRateLimit } from "@/lib/enterprise/rate-limit";
import {
  ChangeWorkflowError,
} from "@/lib/enterprise/change-workflow";
import {
  OptimisticLockError,
  ResourceNotFoundError,
} from "@/lib/enterprise/repository";

export const CONTROL_PLANE_HEADERS = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "X-Robots-Tag": "noindex, nofollow",
};

export class ApiInputError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 | 409 | 413 | 415 = 400
  ) {
    super(message);
    this.name = "ApiInputError";
  }
}

export function controlPlaneJson(
  body: unknown,
  init: ResponseInit = {}
): NextResponse {
  return NextResponse.json(body, {
    ...init,
    headers: { ...CONTROL_PLANE_HEADERS, ...init.headers },
  });
}

export function requireMutationCsrf(request: NextRequest): NextResponse | null {
  return validateMutationCsrf(request)
    ? null
    : controlPlaneJson({ error: "Forbidden" }, { status: 403 });
}

export function requireEnterpriseMutationRateLimit(
  access: EnterpriseAccess
): NextResponse | null {
  const allowed = checkEnterpriseMutationRateLimit(
    access.context.organization.id,
    access.session.user.id
  );
  return allowed
    ? null
    : controlPlaneJson({ error: "Too many requests" }, { status: 429 });
}

export async function readStrictJson(
  request: NextRequest,
  maxBytes = 32 * 1024
): Promise<Record<string, unknown>> {
  const contentType = request.headers.get("content-type")?.split(";")[0]?.trim();
  if (contentType !== "application/json") {
    throw new ApiInputError("Content-Type must be application/json", 415);
  }
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > maxBytes) throw new ApiInputError("Request body is too large", 413);
  const text = await request.text();
  if (Buffer.byteLength(text, "utf8") > maxBytes) {
    throw new ApiInputError("Request body is too large", 413);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ApiInputError("Request body must be valid JSON");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new ApiInputError("Request body must be a JSON object");
  }
  return parsed as Record<string, unknown>;
}

export function exactKeys(
  value: Record<string, unknown>,
  allowed: readonly string[]
): void {
  const allowedSet = new Set(allowed);
  if (Object.keys(value).some((key) => !allowedSet.has(key))) {
    throw new ApiInputError("Request contains unsupported fields");
  }
}

export function requiredString(
  value: unknown,
  field: string,
  maxLength = 128
): string {
  if (typeof value !== "string") throw new ApiInputError(`${field} is required`);
  const result = value.trim();
  if (!result || result.length > maxLength) {
    throw new ApiInputError(`${field} is invalid`);
  }
  return result;
}

export function requiredInteger(value: unknown, field: string): number {
  if (!Number.isInteger(value) || Number(value) < 1) {
    throw new ApiInputError(`${field} must be a positive integer`);
  }
  return Number(value);
}

export function requiredObject(
  value: unknown,
  field: string
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ApiInputError(`${field} must be an object`);
  }
  return value as Record<string, unknown>;
}

export function errorResponse(error: unknown): NextResponse {
  if (error instanceof ApiInputError) {
    return controlPlaneJson({ error: error.message }, { status: error.status });
  }
  if (error instanceof ResourceNotFoundError) {
    return controlPlaneJson({ error: "Not found" }, { status: 404 });
  }
  if (error instanceof OptimisticLockError) {
    return controlPlaneJson({ error: error.message }, { status: 409 });
  }
  if (error instanceof ChangeWorkflowError) {
    if (error.code === "NOT_FOUND") {
      return controlPlaneJson({ error: "Not found" }, { status: 404 });
    }
    return controlPlaneJson(
      { error: error.message, code: error.code },
      { status: error.code === "SELF_APPROVAL" ? 403 : 409 }
    );
  }
  console.error("Enterprise control-plane request failed", error);
  return controlPlaneJson({ error: "Request failed" }, { status: 500 });
}

export async function auditApiEvent(
  access: EnterpriseAccess,
  request: NextRequest,
  input: {
    action: string;
    outcome: "success" | "failure" | "denied";
    resourceType?: string;
    resourceId?: string;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  const ids = correlationIds(request.headers);
  await appendEnterpriseAuditEvent({
    organizationId: access.context.organization.id,
    actorUserId: access.session.user.id,
    action: input.action,
    outcome: input.outcome,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    correlationId: ids.correlationId,
    requestId: ids.requestId,
    metadata: input.metadata,
  });
}

export function workflowContext(access: EnterpriseAccess, request: NextRequest) {
  const ids = correlationIds(request.headers);
  return {
    principal: access.context.principal,
    correlationId: ids.correlationId,
    requestId: ids.requestId,
  };
}

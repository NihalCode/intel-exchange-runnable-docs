import { NextResponse, type NextRequest } from "next/server";

import { findSchemaVersion } from "@/lib/documentation-schemas/repository";
import {
  publishSchemaVersion,
  reviewSchemaVersion,
  rollbackSchemaVersion,
  submitSchemaVersion,
  validateSchemaVersion,
} from "@/lib/documentation-schemas/service";
import { guardEnterpriseApi } from "@/lib/enterprise/guard";
import {
  ApiInputError,
  auditApiEvent,
  controlPlaneJson,
  errorResponse,
  readStrictJson,
  requireMutationCsrf,
} from "@/lib/enterprise/http";
import type { EnterprisePermission } from "@/lib/enterprise/types";

const ACTIONS = new Set([
  "validate",
  "diff",
  "preview",
  "submit",
  "approve",
  "reject",
  "publish",
  "rollback",
]);

function permissionFor(action: string): EnterprisePermission {
  if (action === "approve" || action === "reject") return "schemas.review";
  if (action === "publish" || action === "rollback") return "schemas.publish";
  return action === "diff" || action === "preview" ? "schemas.read" : "schemas.manage";
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ versionId: string; action: string }> }
) {
  const { versionId, action } = await context.params;
  if (!ACTIONS.has(action)) {
    return controlPlaneJson({ error: "Not found" }, { status: 404 });
  }
  const access = await guardEnterpriseApi(request, permissionFor(action));
  if (access instanceof NextResponse) return access;
  const csrfFailure = requireMutationCsrf(request);
  if (csrfFailure) return csrfFailure;
  try {
    const body = await readStrictJson(request);
    const expectedVersion =
      typeof body.expectedVersion === "number" && Number.isInteger(body.expectedVersion)
        ? body.expectedVersion
        : null;
    if (expectedVersion == null) throw new ApiInputError("expectedVersion is required");
    let version;
    if (action === "validate") {
      version = await validateSchemaVersion({
        organizationId: access.context.organization.id,
        versionId,
        expectedVersion,
      });
    } else if (action === "submit") {
      version = await submitSchemaVersion({
        organizationId: access.context.organization.id,
        userId: access.session.user.id,
        versionId,
        expectedVersion,
      });
    } else if (action === "approve" || action === "reject") {
      version = await reviewSchemaVersion({
        organizationId: access.context.organization.id,
        reviewerUserId: access.session.user.id,
        reviewerRole: access.context.principal.role,
        versionId,
        expectedVersion,
        decision: action,
        reason: typeof body.reason === "string" ? body.reason : "",
      });
    } else if (action === "publish") {
      const key =
        request.headers.get("idempotency-key") ??
        (typeof body.idempotencyKey === "string" ? body.idempotencyKey : "");
      if (!key) throw new ApiInputError("Idempotency-Key is required");
      version = await publishSchemaVersion({
        organizationId: access.context.organization.id,
        userId: access.session.user.id,
        role: access.context.principal.role,
        versionId,
        expectedVersion,
        idempotencyKey: key,
      });
    } else if (action === "rollback") {
      version = await rollbackSchemaVersion({
        organizationId: access.context.organization.id,
        userId: access.session.user.id,
        role: access.context.principal.role,
        versionId,
        expectedVersion,
      });
    } else {
      version = await findSchemaVersion(access.context.organization.id, versionId);
      if (!version) return controlPlaneJson({ error: "Not found" }, { status: 404 });
    }
    await auditApiEvent(access, request, {
      action: `documentation.schema_${action}`,
      outcome: "success",
      resourceType: "documentation_schema_version",
      resourceId: versionId,
      metadata: { status: version.status, breakingCount: version.breakingCount },
    });
    return controlPlaneJson({ version });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "SELF_APPROVAL_FORBIDDEN" || code === "FORBIDDEN") {
      return controlPlaneJson({ error: "Forbidden", code }, { status: 403 });
    }
    if (code === "VERSION_CONFLICT") {
      return controlPlaneJson({ error: "Version conflict" }, { status: 409 });
    }
    if (code.endsWith("_NOT_FOUND")) {
      return controlPlaneJson({ error: "Not found" }, { status: 404 });
    }
    return errorResponse(error);
  }
}

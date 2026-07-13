import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  activateChangeRequest,
  markChangeDeploying,
  reviewChangeRequest,
  rollbackChangeRequest,
  scheduleChangeRequest,
  submitChangeRequest,
} from "@/lib/enterprise/change-workflow";
import { guardEnterpriseApi } from "@/lib/enterprise/guard";
import {
  findChangeRequest,
  findControlPlaneResource,
} from "@/lib/enterprise/repository";
import type { EnterprisePermission } from "@/lib/enterprise/types";
import {
  ApiInputError,
  auditApiEvent,
  controlPlaneJson,
  errorResponse,
  exactKeys,
  readStrictJson,
  requireMutationCsrf,
  requireEnterpriseMutationRateLimit,
  requiredInteger,
  requiredString,
  workflowContext,
} from "@/lib/enterprise/http";

export const runtime = "nodejs";

const PERMISSIONS: Record<string, EnterprisePermission> = {
  submit: "changes.submit",
  approve: "changes.approve",
  reject: "changes.approve",
  schedule: "changes.activate",
  activate: "changes.activate",
  rollback: "changes.rollback",
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; action: string }> }
) {
  const csrfFailure = requireMutationCsrf(request);
  if (csrfFailure) return csrfFailure;
  const { id, action } = await params;
  const permission = PERMISSIONS[action];
  if (!permission) return controlPlaneJson({ error: "Not found" }, { status: 404 });
  let access = await guardEnterpriseApi(request, permission);
  if (access instanceof NextResponse) return access;
  const change = await findChangeRequest(access.context.organization.id, id);
  if (!change) return controlPlaneJson({ error: "Not found" }, { status: 404 });
  const resource = await findControlPlaneResource(
    access.context.organization.id,
    change.resourceId
  );
  if (!resource) return controlPlaneJson({ error: "Not found" }, { status: 404 });
  access = await guardEnterpriseApi(request, permission, {
    resource: {
      organizationId: access.context.organization.id,
      environment: resource.environment,
    },
  });
  if (access instanceof NextResponse) return access;
  const rateLimited = requireEnterpriseMutationRateLimit(access);
  if (rateLimited) return rateLimited;

  try {
    const body = await readStrictJson(request);
    let updated;
    if (action === "submit") {
      exactKeys(body, ["expectedVersion"]);
      updated = await submitChangeRequest(
        workflowContext(access, request),
        id,
        requiredInteger(body.expectedVersion, "expectedVersion")
      );
    } else if (action === "approve" || action === "reject") {
      exactKeys(body, ["expectedVersion", "comment"]);
      const comment =
        body.comment == null
          ? undefined
          : requiredString(body.comment, "comment", 500);
      updated = await reviewChangeRequest(workflowContext(access, request), {
        id,
        expectedVersion: requiredInteger(body.expectedVersion, "expectedVersion"),
        decision: action === "approve" ? "APPROVED" : "REJECTED",
        comment,
      });
    } else if (action === "activate") {
      exactKeys(body, ["expectedVersion", "expectedResourceVersion"]);
      const deploying = await markChangeDeploying(
        workflowContext(access, request),
        id,
        requiredInteger(body.expectedVersion, "expectedVersion")
      );
      updated = await activateChangeRequest(workflowContext(access, request), {
        id,
        expectedVersion: deploying.version,
        expectedResourceVersion: requiredInteger(
          body.expectedResourceVersion,
          "expectedResourceVersion"
        ),
      });
    } else if (action === "schedule") {
      exactKeys(body, ["expectedVersion", "scheduledFor"]);
      const scheduledFor = requiredString(body.scheduledFor, "scheduledFor", 40);
      if (!Number.isFinite(Date.parse(scheduledFor))) {
        throw new ApiInputError("scheduledFor must be an ISO date");
      }
      updated = await scheduleChangeRequest(workflowContext(access, request), {
        id,
        expectedVersion: requiredInteger(body.expectedVersion, "expectedVersion"),
        scheduledFor,
      });
    } else {
      exactKeys(body, [
        "expectedVersion",
        "expectedResourceVersion",
        "rollbackConfigVersionId",
      ]);
      updated = await rollbackChangeRequest(workflowContext(access, request), {
        id,
        expectedVersion: requiredInteger(body.expectedVersion, "expectedVersion"),
        expectedResourceVersion: requiredInteger(
          body.expectedResourceVersion,
          "expectedResourceVersion"
        ),
        rollbackConfigVersionId: requiredString(
          body.rollbackConfigVersionId,
          "rollbackConfigVersionId"
        ),
      });
    }
    return controlPlaneJson({ change: updated });
  } catch (error) {
    await auditApiEvent(access, request, {
      action: `change_request.${action}`,
      outcome: "failure",
      resourceType: "change_request",
      resourceId: id,
    });
    return errorResponse(error);
  }
}

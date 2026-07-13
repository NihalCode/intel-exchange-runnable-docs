import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { createChangeRequest } from "@/lib/enterprise/change-workflow";
import { guardEnterpriseApi, type EnterpriseAccess } from "@/lib/enterprise/guard";
import {
  findControlPlaneResource,
  listChangeRequests,
} from "@/lib/enterprise/repository";
import {
  auditApiEvent,
  controlPlaneJson,
  errorResponse,
  exactKeys,
  readStrictJson,
  requireMutationCsrf,
  requireEnterpriseMutationRateLimit,
  requiredObject,
  requiredString,
  workflowContext,
} from "@/lib/enterprise/http";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const access = await guardEnterpriseApi(request, "resources.read");
  if (access instanceof NextResponse) return access;
  return controlPlaneJson({
    changes: await listChangeRequests(access.context.organization.id),
  });
}

export async function POST(request: NextRequest) {
  const csrfFailure = requireMutationCsrf(request);
  if (csrfFailure) return csrfFailure;
  const initialAccess = await guardEnterpriseApi(request, "changes.create");
  if (initialAccess instanceof NextResponse) return initialAccess;
  const rateLimited = requireEnterpriseMutationRateLimit(initialAccess);
  if (rateLimited) return rateLimited;
  let access: EnterpriseAccess = initialAccess;
  try {
    const body = await readStrictJson(request);
    exactKeys(body, ["resourceId", "config", "diff"]);
    const resourceId = requiredString(body.resourceId, "resourceId");
    const idempotencyKey = requiredString(
      request.headers.get("idempotency-key"),
      "Idempotency-Key",
      128
    );
    const resource = await findControlPlaneResource(
      access.context.organization.id,
      resourceId
    );
    if (!resource) {
      return controlPlaneJson({ error: "Not found" }, { status: 404 });
    }
    const scopedAccess = await guardEnterpriseApi(request, "changes.create", {
      resource: {
        organizationId: access.context.organization.id,
        environment: resource.environment,
      },
    });
    if (scopedAccess instanceof NextResponse) return scopedAccess;
    access = scopedAccess;
    const change = await createChangeRequest(workflowContext(access, request), {
      resourceId,
      config: requiredObject(body.config, "config"),
      diff: requiredObject(body.diff, "diff"),
      idempotencyKey,
    });
    return controlPlaneJson({ change }, { status: 201 });
  } catch (error) {
    await auditApiEvent(access, request, {
      action: "change_request.created",
      outcome: "failure",
    });
    return errorResponse(error);
  }
}

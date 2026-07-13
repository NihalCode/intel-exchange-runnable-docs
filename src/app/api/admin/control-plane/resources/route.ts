import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { guardEnterpriseApi, type EnterpriseAccess } from "@/lib/enterprise/guard";
import {
  createControlPlaneResource,
  listControlPlaneResources,
} from "@/lib/enterprise/repository";
import type { EnterpriseEnvironment } from "@/lib/enterprise/types";
import {
  ApiInputError,
  auditApiEvent,
  controlPlaneJson,
  errorResponse,
  exactKeys,
  readStrictJson,
  requireMutationCsrf,
  requireEnterpriseMutationRateLimit,
  requiredString,
} from "@/lib/enterprise/http";

export const runtime = "nodejs";
const ENVIRONMENTS = new Set(["development", "staging", "production"]);

export async function GET(request: NextRequest) {
  const access = await guardEnterpriseApi(request, "resources.read");
  if (access instanceof NextResponse) return access;
  return controlPlaneJson({
    resources: await listControlPlaneResources(access.context.organization.id),
  });
}

export async function POST(request: NextRequest) {
  const csrfFailure = requireMutationCsrf(request);
  if (csrfFailure) return csrfFailure;
  const initialAccess = await guardEnterpriseApi(request, "resources.write");
  if (initialAccess instanceof NextResponse) return initialAccess;
  const rateLimited = requireEnterpriseMutationRateLimit(initialAccess);
  if (rateLimited) return rateLimited;
  let access: EnterpriseAccess = initialAccess;
  try {
    const body = await readStrictJson(request);
    exactKeys(body, ["name", "environment", "resourceType"]);
    const name = requiredString(body.name, "name", 100);
    const resourceType = requiredString(body.resourceType, "resourceType", 64);
    const environment = requiredString(body.environment, "environment", 20);
    if (!ENVIRONMENTS.has(environment)) {
      throw new ApiInputError("environment is invalid");
    }
    const scopedAccess = await guardEnterpriseApi(request, "resources.write", {
      resource: {
        organizationId: access.context.organization.id,
        environment: environment as EnterpriseEnvironment,
      },
    });
    if (scopedAccess instanceof NextResponse) return scopedAccess;
    access = scopedAccess;
    const resource = await createControlPlaneResource({
      organizationId: access.context.organization.id,
      createdByUserId: access.session.user.id,
      name,
      resourceType,
      environment: environment as EnterpriseEnvironment,
    });
    await auditApiEvent(access, request, {
      action: "control_plane.resource_created",
      outcome: "success",
      resourceType: "control_plane_resource",
      resourceId: resource.id,
      metadata: { environment },
    });
    return controlPlaneJson({ resource }, { status: 201 });
  } catch (error) {
    await auditApiEvent(access, request, {
      action: "control_plane.resource_created",
      outcome: "failure",
    });
    return errorResponse(error);
  }
}

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { guardEnterpriseApi } from "@/lib/enterprise/guard";
import {
  findControlPlaneResource,
  updateControlPlaneResource,
} from "@/lib/enterprise/repository";
import {
  auditApiEvent,
  controlPlaneJson,
  errorResponse,
  exactKeys,
  readStrictJson,
  requireMutationCsrf,
  requireEnterpriseMutationRateLimit,
  requiredInteger,
  requiredString,
} from "@/lib/enterprise/http";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const access = await guardEnterpriseApi(request, "resources.read");
  if (access instanceof NextResponse) return access;
  const { id } = await params;
  const resource = await findControlPlaneResource(
    access.context.organization.id,
    id
  );
  return resource
    ? controlPlaneJson({ resource })
    : controlPlaneJson({ error: "Not found" }, { status: 404 });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const csrfFailure = requireMutationCsrf(request);
  if (csrfFailure) return csrfFailure;
  let access = await guardEnterpriseApi(request, "resources.read");
  if (access instanceof NextResponse) return access;
  const { id } = await params;
  const existing = await findControlPlaneResource(
    access.context.organization.id,
    id
  );
  if (!existing) return controlPlaneJson({ error: "Not found" }, { status: 404 });
  access = await guardEnterpriseApi(request, "resources.write", {
    resource: {
      organizationId: access.context.organization.id,
      environment: existing.environment,
    },
  });
  if (access instanceof NextResponse) return access;
  const rateLimited = requireEnterpriseMutationRateLimit(access);
  if (rateLimited) return rateLimited;
  try {
    const body = await readStrictJson(request);
    exactKeys(body, ["name", "expectedVersion"]);
    const resource = await updateControlPlaneResource({
      organizationId: access.context.organization.id,
      id,
      name: requiredString(body.name, "name", 100),
      expectedVersion: requiredInteger(body.expectedVersion, "expectedVersion"),
    });
    await auditApiEvent(access, request, {
      action: "control_plane.resource_updated",
      outcome: "success",
      resourceType: "control_plane_resource",
      resourceId: id,
      metadata: { version: resource.version },
    });
    return controlPlaneJson({ resource });
  } catch (error) {
    await auditApiEvent(access, request, {
      action: "control_plane.resource_updated",
      outcome: "failure",
      resourceType: "control_plane_resource",
      resourceId: id,
    });
    return errorResponse(error);
  }
}

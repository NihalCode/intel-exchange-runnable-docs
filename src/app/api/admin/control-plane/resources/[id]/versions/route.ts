import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { guardEnterpriseApi } from "@/lib/enterprise/guard";
import {
  createConfigVersion,
  findControlPlaneResource,
  listConfigVersions,
} from "@/lib/enterprise/repository";
import { redactStructuredValue } from "@/lib/enterprise/observability";
import {
  auditApiEvent,
  controlPlaneJson,
  errorResponse,
  exactKeys,
  readStrictJson,
  requireMutationCsrf,
  requireEnterpriseMutationRateLimit,
  requiredObject,
} from "@/lib/enterprise/http";

export const runtime = "nodejs";

async function scopedResource(request: NextRequest, id: string) {
  const access = await guardEnterpriseApi(request, "resources.read");
  if (access instanceof NextResponse) return access;
  const resource = await findControlPlaneResource(
    access.context.organization.id,
    id
  );
  return resource ? { access, resource } : null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const scoped = await scopedResource(request, id);
  if (scoped instanceof NextResponse) return scoped;
  if (!scoped) return controlPlaneJson({ error: "Not found" }, { status: 404 });
  return controlPlaneJson({
    versions: await listConfigVersions(scoped.access.context.organization.id, id),
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const csrfFailure = requireMutationCsrf(request);
  if (csrfFailure) return csrfFailure;
  const { id } = await params;
  const scoped = await scopedResource(request, id);
  if (scoped instanceof NextResponse) return scoped;
  if (!scoped) return controlPlaneJson({ error: "Not found" }, { status: 404 });
  const access = await guardEnterpriseApi(request, "resources.write", {
    resource: {
      organizationId: scoped.access.context.organization.id,
      environment: scoped.resource.environment,
    },
  });
  if (access instanceof NextResponse) return access;
  const rateLimited = requireEnterpriseMutationRateLimit(access);
  if (rateLimited) return rateLimited;
  try {
    const body = await readStrictJson(request);
    exactKeys(body, ["config", "diff"]);
    const config = requiredObject(body.config, "config");
    const diff = requiredObject(body.diff, "diff");
    const version = await createConfigVersion({
      organizationId: access.context.organization.id,
      resourceId: id,
      config,
      sanitizedDiff: redactStructuredValue(diff),
      createdByUserId: access.session.user.id,
    });
    await auditApiEvent(access, request, {
      action: "control_plane.config_version_created",
      outcome: "success",
      resourceType: "control_plane_resource",
      resourceId: id,
      metadata: { versionNumber: version.versionNumber },
    });
    return controlPlaneJson({ version }, { status: 201 });
  } catch (error) {
    await auditApiEvent(access, request, {
      action: "control_plane.config_version_created",
      outcome: "failure",
      resourceType: "control_plane_resource",
      resourceId: id,
    });
    return errorResponse(error);
  }
}

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { computeSanitizedConfigDiff } from "@/lib/enterprise/change-detail";
import { guardEnterpriseApi } from "@/lib/enterprise/guard";
import {
  findChangeRequest,
  findControlPlaneResource,
  getActiveConfigForResource,
  getConfigVersionDetail,
} from "@/lib/enterprise/repository";
import { controlPlaneJson } from "@/lib/enterprise/http";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const access = await guardEnterpriseApi(request, "resources.read");
  if (access instanceof NextResponse) return access;
  const { id } = await params;
  const change = await findChangeRequest(access.context.organization.id, id);
  if (!change) return controlPlaneJson({ error: "Not found" }, { status: 404 });
  const resource = await findControlPlaneResource(
    access.context.organization.id,
    change.resourceId
  );
  if (!resource) return controlPlaneJson({ error: "Not found" }, { status: 404 });
  const target = await getConfigVersionDetail(
    access.context.organization.id,
    change.targetConfigVersionId
  );
  if (!target) return controlPlaneJson({ error: "Not found" }, { status: 404 });
  const activeConfig = await getActiveConfigForResource(
    access.context.organization.id,
    change.resourceId
  );
  const diffVsActive = computeSanitizedConfigDiff(activeConfig, target.config);
  return controlPlaneJson({
    change,
    resource: {
      id: resource.id,
      name: resource.name,
      environment: resource.environment,
      activeConfigVersion: resource.activeConfigVersion,
      version: resource.version,
    },
    targetConfig: {
      id: target.id,
      versionNumber: target.versionNumber,
      sanitizedDiff: target.sanitizedDiff,
    },
    diffVsActive,
  });
}

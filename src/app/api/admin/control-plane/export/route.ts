import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { listApiKeyMetadata } from "@/lib/enterprise/api-keys";
import { listEnterpriseAuditEvents } from "@/lib/enterprise/audit";
import { guardEnterpriseApi } from "@/lib/enterprise/guard";
import {
  listChangeRequests,
  listConfigVersions,
  listControlPlaneResources,
} from "@/lib/enterprise/repository";
import { CONTROL_PLANE_HEADERS, controlPlaneJson } from "@/lib/enterprise/http";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const kind = new URL(request.url).searchParams.get("kind");
  if (kind !== "configuration" && kind !== "audit") {
    return controlPlaneJson({ error: "kind must be configuration or audit" }, { status: 400 });
  }
  const access = await guardEnterpriseApi(
    request,
    kind === "audit" ? "audit.read" : "resources.read"
  );
  if (access instanceof NextResponse) return access;

  const organizationId = access.context.organization.id;
  let data: unknown;
  if (kind === "audit") {
    data = { events: await listEnterpriseAuditEvents(organizationId, 500) };
  } else {
    const resources = await listControlPlaneResources(organizationId);
    data = {
      resources: await Promise.all(
        resources.map(async (resource) => ({
          ...resource,
          versions: await listConfigVersions(organizationId, resource.id),
        }))
      ),
      changes: await listChangeRequests(organizationId, 200),
      credentials: await listApiKeyMetadata(organizationId),
    };
  }
  const safeSlug = access.context.organization.slug.replace(/[^a-z0-9_-]/gi, "-");
  return new NextResponse(
    JSON.stringify(
      {
        organization: {
          id: organizationId,
          name: access.context.organization.name,
          slug: access.context.organization.slug,
        },
        exportedAt: new Date().toISOString(),
        kind,
        data,
      },
      null,
      2
    ),
    {
      headers: {
        ...CONTROL_PLANE_HEADERS,
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${safeSlug}-${kind}-export.json"`,
      },
    }
  );
}

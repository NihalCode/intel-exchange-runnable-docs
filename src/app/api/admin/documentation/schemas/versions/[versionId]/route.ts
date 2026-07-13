import { NextResponse, type NextRequest } from "next/server";

import {
  findSchema,
  findSchemaVersion,
} from "@/lib/documentation-schemas/repository";
import { guardEnterpriseApi } from "@/lib/enterprise/guard";
import { controlPlaneJson } from "@/lib/enterprise/http";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ versionId: string }> }
) {
  const access = await guardEnterpriseApi(request, "schemas.read");
  if (access instanceof NextResponse) return access;
  const { versionId } = await context.params;
  const version = await findSchemaVersion(access.context.organization.id, versionId);
  if (!version) return controlPlaneJson({ error: "Not found" }, { status: 404 });
  const schema = await findSchema(access.context.organization.id, version.schemaId);
  return controlPlaneJson({ schema, version });
}

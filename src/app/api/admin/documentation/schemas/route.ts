import { NextResponse, type NextRequest } from "next/server";

import {
  listSchemas,
  listSchemaVersions,
} from "@/lib/documentation-schemas/repository";
import { createDocumentationSchema } from "@/lib/documentation-schemas/service";
import {
  DOCUMENTATION_SCHEMA_FORMATS,
  type DocumentationSchemaFormat,
} from "@/lib/documentation-schemas/validation";
import { guardEnterpriseApi } from "@/lib/enterprise/guard";
import {
  ApiInputError,
  auditApiEvent,
  controlPlaneJson,
  errorResponse,
  exactKeys,
  readStrictJson,
  requireMutationCsrf,
  requiredString,
} from "@/lib/enterprise/http";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const access = await guardEnterpriseApi(request, "schemas.read");
  if (access instanceof NextResponse) return access;
  const schemas = await listSchemas(access.context.organization.id);
  const result = await Promise.all(
    schemas.map(async (schema) => ({
      ...schema,
      versions: await listSchemaVersions(access.context.organization.id, schema.id),
    }))
  );
  return controlPlaneJson({ schemas: result });
}

export async function POST(request: NextRequest) {
  const access = await guardEnterpriseApi(request, "schemas.manage");
  if (access instanceof NextResponse) return access;
  const csrfFailure = requireMutationCsrf(request);
  if (csrfFailure) return csrfFailure;
  try {
    const body = await readStrictJson(request, 5 * 1024 * 1024 + 16 * 1024);
    exactKeys(body, ["name", "format", "productId", "environment", "source"]);
    const format = requiredString(body.format, "format", 32);
    if (!DOCUMENTATION_SCHEMA_FORMATS.includes(format as DocumentationSchemaFormat)) {
      throw new ApiInputError("format is invalid");
    }
    const environment = requiredString(body.environment, "environment", 32);
    if (!["development", "staging", "production"].includes(environment)) {
      throw new ApiInputError("environment is invalid");
    }
    if (environment === "production" && access.context.principal.role === "developer") {
      return controlPlaneJson({ error: "Forbidden" }, { status: 403 });
    }
    const result = await createDocumentationSchema({
      organizationId: access.context.organization.id,
      userId: access.session.user.id,
      name: requiredString(body.name, "name", 128),
      format: format as DocumentationSchemaFormat,
      productId: requiredString(body.productId, "productId", 32),
      environment,
      sourceText: requiredString(body.source, "source", 5 * 1024 * 1024),
    });
    await auditApiEvent(access, request, {
      action: "documentation.schema_created",
      outcome: "success",
      resourceType: "documentation_schema",
      resourceId: result.schema.id,
      metadata: { format, environment, productId: result.schema.productId },
    });
    return controlPlaneJson(result, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  createApiKey,
  listApiKeyMetadata,
} from "@/lib/enterprise/api-keys";
import { guardEnterpriseApi } from "@/lib/enterprise/guard";
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
  const access = await guardEnterpriseApi(request, "credentials.read_metadata");
  if (access instanceof NextResponse) return access;
  return controlPlaneJson({
    credentials: await listApiKeyMetadata(access.context.organization.id),
  });
}

export async function POST(request: NextRequest) {
  const csrfFailure = requireMutationCsrf(request);
  if (csrfFailure) return csrfFailure;
  const access = await guardEnterpriseApi(request, "credentials.manage");
  if (access instanceof NextResponse) return access;
  const rateLimited = requireEnterpriseMutationRateLimit(access);
  if (rateLimited) return rateLimited;
  try {
    const body = await readStrictJson(request);
    exactKeys(body, ["name", "environment", "expiresAt"]);
    const environment = requiredString(body.environment, "environment", 20);
    if (!ENVIRONMENTS.has(environment)) {
      throw new ApiInputError("environment is invalid");
    }
    const expiresAt =
      body.expiresAt == null
        ? null
        : requiredString(body.expiresAt, "expiresAt", 40);
    if (expiresAt && !Number.isFinite(Date.parse(expiresAt))) {
      throw new ApiInputError("expiresAt must be an ISO date");
    }
    const issued = await createApiKey({
      organizationId: access.context.organization.id,
      createdByUserId: access.session.user.id,
      name: requiredString(body.name, "name", 100),
      environment: environment as EnterpriseEnvironment,
      expiresAt,
    });
    await auditApiEvent(access, request, {
      action: "api_key.created",
      outcome: "success",
      resourceType: "api_credential",
      resourceId: issued.metadata.id,
      metadata: { environment },
    });
    return controlPlaneJson(
      { credential: issued.metadata, plaintext: issued.plaintext, oneTime: true },
      { status: 201 }
    );
  } catch (error) {
    await auditApiEvent(access, request, {
      action: "api_key.created",
      outcome: "failure",
    });
    return errorResponse(error);
  }
}

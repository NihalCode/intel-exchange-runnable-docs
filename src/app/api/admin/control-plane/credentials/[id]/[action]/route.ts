import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  findApiKeyMetadata,
  revokeApiKey,
  rotateApiKey,
} from "@/lib/enterprise/api-keys";
import { guardEnterpriseApi } from "@/lib/enterprise/guard";
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
} from "@/lib/enterprise/http";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; action: string }> }
) {
  const csrfFailure = requireMutationCsrf(request);
  if (csrfFailure) return csrfFailure;
  const { id, action } = await params;
  if (action !== "rotate" && action !== "revoke") {
    return controlPlaneJson({ error: "Not found" }, { status: 404 });
  }
  const access = await guardEnterpriseApi(request, "credentials.manage");
  if (access instanceof NextResponse) return access;
  const rateLimited = requireEnterpriseMutationRateLimit(access);
  if (rateLimited) return rateLimited;
  const existing = await findApiKeyMetadata(access.context.organization.id, id);
  if (!existing) return controlPlaneJson({ error: "Not found" }, { status: 404 });
  try {
    const body = await readStrictJson(request);
    exactKeys(body, action === "rotate" ? ["expectedVersion", "name"] : ["expectedVersion"]);
    const expectedVersion = requiredInteger(body.expectedVersion, "expectedVersion");
    if (existing.version !== expectedVersion || existing.status !== "active") {
      throw new ApiInputError("Credential changed; reload and retry", 409);
    }
    if (action === "revoke") {
      await revokeApiKey({
        organizationId: access.context.organization.id,
        credentialId: id,
        actorUserId: access.session.user.id,
        expectedVersion,
      });
      await auditApiEvent(access, request, {
        action: "api_key.revoked",
        outcome: "success",
        resourceType: "api_credential",
        resourceId: id,
      });
      return controlPlaneJson({ revoked: true });
    }
    const issued = await rotateApiKey({
      organizationId: access.context.organization.id,
      credentialId: id,
      actorUserId: access.session.user.id,
      expectedVersion,
      newName:
        body.name == null ? undefined : requiredString(body.name, "name", 100),
    });
    await auditApiEvent(access, request, {
      action: "api_key.rotated",
      outcome: "success",
      resourceType: "api_credential",
      resourceId: id,
      metadata: { replacementId: issued.metadata.id },
    });
    return controlPlaneJson({
      credential: issued.metadata,
      plaintext: issued.plaintext,
      oneTime: true,
    });
  } catch (error) {
    await auditApiEvent(access, request, {
      action: `api_key.${action}`,
      outcome: "failure",
      resourceType: "api_credential",
      resourceId: id,
    });
    return errorResponse(error);
  }
}

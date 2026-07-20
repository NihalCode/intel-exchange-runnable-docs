import { NextResponse, type NextRequest } from "next/server";

import {
  isDocumentationFeatureKey,
  listDocumentationFeatures,
  updateDocumentationFeature,
} from "@/lib/documentation-features";
import { resolveDocumentationFeatureEnabled } from "@/lib/documentation-features/resolve-enabled";
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

export async function GET(request: NextRequest) {
  const access = await guardEnterpriseApi(request, "features.read");
  if (access instanceof NextResponse) return access;
  const features = await listDocumentationFeatures(access.context.organization.id);
  const withEffective = await Promise.all(
    features.map(async (feature) => {
      const effectiveEnabled = await resolveDocumentationFeatureEnabled({
        organizationId: access.context.organization.id,
        key: feature.key,
      });
      return {
        ...feature,
        effectiveEnabled,
        autoEnabledByDeployment: effectiveEnabled && !feature.enabled,
      };
    })
  );
  return controlPlaneJson({ features: withEffective });
}

export async function PATCH(request: NextRequest) {
  const access = await guardEnterpriseApi(request, "features.manage");
  if (access instanceof NextResponse) return access;
  const csrfFailure = requireMutationCsrf(request);
  if (csrfFailure) return csrfFailure;
  try {
    const body = await readStrictJson(request);
    exactKeys(body, [
      "key",
      "enabled",
      "allowedEnvironments",
      "allowedRoles",
      "expectedVersion",
    ]);
    const key = requiredString(body.key, "key", 64);
    if (!isDocumentationFeatureKey(key) || typeof body.enabled !== "boolean") {
      throw new ApiInputError("key and enabled are required");
    }
    const allowedEnvironments = Array.isArray(body.allowedEnvironments)
      ? body.allowedEnvironments.map(String)
      : [];
    const allowedRoles = Array.isArray(body.allowedRoles)
      ? body.allowedRoles.map(String)
      : [];
    const feature = await updateDocumentationFeature({
      organizationId: access.context.organization.id,
      userId: access.session.user.id,
      key,
      enabled: body.enabled,
      allowedEnvironments,
      allowedRoles,
      expectedVersion:
        typeof body.expectedVersion === "number" ? body.expectedVersion : undefined,
    });
    await auditApiEvent(access, request, {
      action: "documentation.feature_updated",
      outcome: "success",
      resourceType: "documentation_feature",
      resourceId: key,
      metadata: { enabled: feature.enabled, allowedEnvironments, allowedRoles },
    });
    return controlPlaneJson({ feature });
  } catch (error) {
    if (error instanceof Error && error.message === "VERSION_CONFLICT") {
      return controlPlaneJson({ error: "Version conflict" }, { status: 409 });
    }
    return errorResponse(error);
  }
}

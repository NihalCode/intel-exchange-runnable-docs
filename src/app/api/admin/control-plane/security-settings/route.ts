import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { guardEnterpriseApi } from "@/lib/enterprise/guard";
import {
  getSecuritySettings,
  sanitizeSecuritySettingsPatch,
  SecuritySettingsValidationError,
  SecuritySettingsVersionError,
  updateSecuritySettings,
} from "@/lib/enterprise/security-settings";
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
} from "@/lib/enterprise/http";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const access = await guardEnterpriseApi(request, "security_settings.manage");
  if (access instanceof NextResponse) return access;
  const settings = await getSecuritySettings(access.context.organization.id);
  return controlPlaneJson({ settings });
}

export async function PATCH(request: NextRequest) {
  const csrfFailure = requireMutationCsrf(request);
  if (csrfFailure) return csrfFailure;
  const access = await guardEnterpriseApi(request, "security_settings.manage");
  if (access instanceof NextResponse) return access;
  const rateLimited = requireEnterpriseMutationRateLimit(access);
  if (rateLimited) return rateLimited;
  try {
    const body = await readStrictJson(request);
    exactKeys(body, ["expectedVersion", "settings"]);
    if (!body.settings || typeof body.settings !== "object" || Array.isArray(body.settings)) {
      throw new ApiInputError("settings must be an object");
    }
    const patch = sanitizeSecuritySettingsPatch(
      body.settings as Record<string, unknown>
    );
    if (!Object.keys(patch).length) {
      throw new ApiInputError("settings must include at least one supported field");
    }
    const updated = await updateSecuritySettings({
      organizationId: access.context.organization.id,
      actorUserId: access.session.user.id,
      patch,
      expectedVersion: requiredInteger(body.expectedVersion, "expectedVersion"),
    });
    await auditApiEvent(access, request, {
      action: "security_settings.updated",
      outcome: "success",
      resourceType: "organization_security_settings",
      resourceId: access.context.organization.id,
      metadata: { version: updated.version },
    });
    return controlPlaneJson({ settings: updated });
  } catch (error) {
    await auditApiEvent(access, request, {
      action: "security_settings.updated",
      outcome: "failure",
      resourceType: "organization_security_settings",
      resourceId: access.context.organization.id,
    });
    if (error instanceof SecuritySettingsValidationError) {
      return controlPlaneJson({ error: error.message }, { status: 400 });
    }
    if (error instanceof SecuritySettingsVersionError) {
      return controlPlaneJson({ error: error.message }, { status: 409 });
    }
    return errorResponse(error);
  }
}

import { NextResponse, type NextRequest } from "next/server";

import { logDocumentationAuthEvent } from "@/lib/documentation-auth/audit";
import { requirePermission } from "@/lib/documentation-auth/session";
import { DOCUMENTATION_ROLES } from "@/lib/documentation-auth/types";
import {
  createDirectDocumentationUser,
  listInvites,
  listUsers,
} from "@/lib/db/repository";
import { isDocumentationRole } from "@/lib/documentation-auth/permissions";
import { resolveOrganizationContext } from "@/lib/enterprise/organization-context";
import {
  canProvisionRole,
  provisionAuth0User,
} from "@/lib/auth0-management/service";
import {
  CSRF_COOKIE_NAME,
  createCsrfToken,
  csrfCookieOptions,
} from "@/lib/enterprise/csrf";
import { requireMutationCsrf } from "@/lib/enterprise/http";
import { checkRateLimit } from "@/lib/documentation-auth/rate-limit";
import {
  Auth0ProvisioningError,
  userFacingProvisioningMessage,
} from "@/lib/auth0-management/errors";
import {
  OktaProvisioningError,
  userFacingOktaProvisioningMessage,
} from "@/lib/okta/errors";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const session = await requirePermission("manage_users", request);
  if (session instanceof NextResponse) return session;

  const [users, invites] = await Promise.all([listUsers(), listInvites()]);
  const csrfToken = createCsrfToken();
  const response = NextResponse.json({
    users,
    invites,
    roles: DOCUMENTATION_ROLES,
    csrfToken,
  });
  response.cookies.set(CSRF_COOKIE_NAME, csrfToken, csrfCookieOptions());
  return response;
}

export async function POST(request: NextRequest) {
  const session = await requirePermission("manage_users", request);
  if (session instanceof NextResponse) return session;
  const csrfFailure = requireMutationCsrf(request);
  if (csrfFailure) return csrfFailure;
  if (!checkRateLimit(`users-create:${session.user.id}`, 20, 60_000)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  let body: { email?: string; name?: string; role?: string; expiresAt?: string | null };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email = body.email?.trim();
  const role = body.role?.trim();
  if (!email || !role || !isDocumentationRole(role)) {
    return NextResponse.json({ error: "Valid email and role are required" }, { status: 400 });
  }
  if (!canProvisionRole(session.user.role, role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;
  if (expiresAt && (!Number.isFinite(expiresAt.getTime()) || expiresAt <= new Date())) {
    return NextResponse.json({ error: "Expiry must be a future date" }, { status: 400 });
  }
  try {
    const organization = await resolveOrganizationContext(session);
    const provisioned = await provisionAuth0User({
      email,
      displayName: body.name?.trim() || null,
      auth0OrganizationId: organization.organization.auth0OrganizationId,
    });
    const user = await createDirectDocumentationUser({
      auth0UserId: provisioned.user.user_id,
      email,
      name: body.name?.trim() || provisioned.user.name || null,
      role,
      createdByUserId: session.user.id,
      organizationId: organization.organization.id,
      expiresAt: expiresAt?.toISOString() ?? null,
      providerSetupStatus: provisioned.setupStatus,
    });

    await logDocumentationAuthEvent({
      action: "auth.user_provisioned",
      userId: session.user.id,
      actorEmail: session.user.email,
      metadata: {
        userId: user.id,
        email: user.email,
        role: user.role,
        organizationId: organization.organization.id,
        expiresAt: expiresAt?.toISOString() ?? null,
      },
    });

    return NextResponse.json(
      { user, setupStatus: provisioned.setupStatus },
      { status: provisioned.created ? 201 : 200 }
    );
  } catch (error) {
    if (error instanceof OktaProvisioningError) {
      const mapped = userFacingOktaProvisioningMessage(error.code, error.detail);
      return NextResponse.json(
        { error: mapped.error, hint: mapped.hint, code: error.code },
        { status: mapped.status }
      );
    }
    if (error instanceof Auth0ProvisioningError) {
      const mapped = userFacingProvisioningMessage(error.code, error.detail);
      return NextResponse.json(
        { error: mapped.error, hint: mapped.hint, code: error.code },
        { status: mapped.status }
      );
    }
    const code = error instanceof Error ? error.message : "";
    if (code === "CROSS_ORGANIZATION_USER" || code === "USER_EMAIL_CONFLICT") {
      const mapped = userFacingProvisioningMessage(code);
      return NextResponse.json(
        { error: mapped.error, code, hint: mapped.hint },
        { status: mapped.status }
      );
    }
    return NextResponse.json(
      { error: "User provisioning failed", code: "USER_PROVISIONING_FAILED" },
      { status: 502 }
    );
  }
}

import "server-only";

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { logDocumentationAuthEvent } from "@/lib/documentation-auth/audit";
import { isAuthEnabled, isAuthDisabled, isTestAuthMode } from "@/lib/documentation-auth/config";
import { normalizeEmail, emailDomain } from "@/lib/documentation-auth/email-utils";
import { checkEmailAccess } from "@/lib/documentation-auth/invite-gate";
import {
  hasPermission,
  permissionsForRole,
} from "@/lib/documentation-auth/permissions";
import type {
  AccessDeniedReason,
  DocumentationPermission,
  DocumentationRole,
} from "@/lib/documentation-auth/types";
import { auth0 } from "@/lib/auth0";
import {
  acceptInvite,
  createUserFromInvite,
  findUserByAuth0Id,
  findUserByEmail,
  updateUserOnLogin,
} from "@/lib/db/repository";

export interface AppSessionUser {
  id: string;
  auth0UserId: string;
  email: string;
  name: string | null;
  role: DocumentationRole;
  status: "active" | "disabled" | "pending";
  picture?: string | null;
}

export interface AppSession {
  user: AppSessionUser;
  authProvider: "auth0" | "test" | "disabled";
}

export interface AppSessionResult {
  session: AppSession | null;
  accessDenied?: {
    reason: AccessDeniedReason;
    invitedEmail?: string;
  };
  auth0Authenticated?: boolean;
}

function testRoleFromRequest(request?: NextRequest): DocumentationRole {
  const header = request?.headers.get("x-test-role")?.trim();
  const roles: DocumentationRole[] = [
    "owner",
    "admin",
    "documentation_manager",
    "developer",
    "viewer",
  ];
  if (header && roles.includes(header as DocumentationRole)) {
    return header as DocumentationRole;
  }
  return "owner";
}

function mockSession(request?: NextRequest): AppSession {
  const role = testRoleFromRequest(request);
  return {
    authProvider: isTestAuthMode() ? "test" : "disabled",
    user: {
      id: isTestAuthMode() ? `test-user-${role}` : "local-dev-user",
      auth0UserId: isTestAuthMode() ? `auth0|test-${role}` : "auth0|local-dev",
      email: isTestAuthMode() ? `${role}@test.local` : "dev@localhost",
      name: isTestAuthMode() ? `Test ${role}` : "Local Developer",
      role,
      status: "active",
    },
  };
}

async function resolveAuth0User(request?: NextRequest) {
  if (!auth0) return null;
  const authSession = request
    ? await auth0.getSession(request)
    : await auth0.getSession();
  const authUser = authSession?.user;
  if (!authUser?.sub || !authUser.email) return null;
  return {
    sub: authUser.sub,
    email: normalizeEmail(authUser.email),
    name: authUser.name ?? authUser.nickname ?? null,
    picture: authUser.picture ?? null,
  };
}

function toAppSession(stored: {
  id: string;
  auth0UserId: string;
  email: string;
  name: string | null;
  role: DocumentationRole;
  status: "active" | "disabled" | "pending";
  picture?: string | null;
}): AppSession {
  return {
    authProvider: "auth0",
    user: {
      id: stored.id,
      auth0UserId: stored.auth0UserId,
      email: stored.email,
      name: stored.name,
      role: stored.role,
      status: stored.status,
      picture: stored.picture ?? null,
    },
  };
}

/** Resolve app session with invite-only enforcement. */
export async function getAppSessionResult(
  request?: NextRequest
): Promise<AppSessionResult> {
  if (!isAuthEnabled()) {
    return { session: mockSession(request) };
  }

  if (!auth0) {
    return { session: null };
  }

  const authUser = await resolveAuth0User(request);
  if (!authUser) {
    return { session: null, auth0Authenticated: false };
  }

  const existingById = await findUserByAuth0Id(authUser.sub);
  const existingByEmail = await findUserByEmail(authUser.email);

  if (existingById) {
    if (existingById.status === "disabled") {
      await logDocumentationAuthEvent({
        action: "auth.blocked_disabled_user",
        userId: existingById.id,
        actorEmail: authUser.email,
      });
      return {
        session: null,
        auth0Authenticated: true,
        accessDenied: { reason: "disabled" },
      };
    }
    const updated = await updateUserOnLogin({
      auth0UserId: authUser.sub,
      email: authUser.email,
      name: authUser.name,
      picture: authUser.picture,
    });
    if (!updated) {
      return {
        session: null,
        auth0Authenticated: true,
        accessDenied: { reason: "invite_required" },
      };
    }
    await logDocumentationAuthEvent({
      action: "auth.login_success",
      userId: updated.id,
      actorEmail: updated.email,
      metadata: { connection: "auth0" },
    });
    return {
      session: toAppSession({ ...updated, name: updated.name ?? null }),
      auth0Authenticated: true,
    };
  }

  if (existingByEmail && existingByEmail.auth0UserId !== authUser.sub) {
    await logDocumentationAuthEvent({
      action: "auth.wrong_email_invite_attempt",
      actorEmail: authUser.email,
      metadata: { invitedEmail: existingByEmail.email },
    });
    return {
      session: null,
      auth0Authenticated: true,
      accessDenied: {
        reason: "wrong_invite_email",
        invitedEmail: existingByEmail.email,
      },
    };
  }

  const access = await checkEmailAccess(authUser.email);
  if (!access.allowed) {
    const reason: AccessDeniedReason =
      access.reason === "disabled"
        ? "disabled"
        : access.reason === "expired_invite"
          ? "expired_invite"
          : "invite_required";

    await logDocumentationAuthEvent({
      action: "auth.blocked_uninvited_login",
      actorEmail: authUser.email,
      metadata: {
        emailDomain: emailDomain(authUser.email),
        reason: access.reason,
      },
    });

    return {
      session: null,
      auth0Authenticated: true,
      accessDenied: { reason },
    };
  }

  const role = access.role ?? "viewer";
  const invitedByUserId = access.invite?.invitedByUserId ?? null;

  const created = await createUserFromInvite({
    auth0UserId: authUser.sub,
    email: authUser.email,
    name: authUser.name,
    picture: authUser.picture,
    role,
    invitedByUserId,
  });

  if (access.invite) {
    await acceptInvite(access.invite.id);
    await logDocumentationAuthEvent({
      action: "auth.invite_accepted",
      userId: created.id,
      actorEmail: created.email,
      metadata: { inviteId: access.invite.id, role: created.role },
    });
  } else {
    await logDocumentationAuthEvent({
      action: "auth.bootstrap_owner_created",
      userId: created.id,
      actorEmail: created.email,
      metadata: { role: created.role },
    });
  }

  await logDocumentationAuthEvent({
    action: "auth.login_success",
    userId: created.id,
    actorEmail: created.email,
    metadata: { firstLogin: true },
  });

  return {
    session: toAppSession({ ...created, name: created.name ?? null }),
    auth0Authenticated: true,
  };
}

export async function getAppSession(request?: NextRequest): Promise<AppSession | null> {
  const result = await getAppSessionResult(request);
  return result.session;
}

export async function requireSession(
  request?: NextRequest
): Promise<AppSession | NextResponse> {
  const result = await getAppSessionResult(request);
  if (result.session) return result.session;

  if (result.accessDenied) {
    return NextResponse.json(
      {
        error: "Access denied",
        reason: result.accessDenied.reason,
        invitedEmail: result.accessDenied.invitedEmail,
      },
      { status: 403 }
    );
  }

  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function requirePermission(
  permission: DocumentationPermission,
  request?: NextRequest
): Promise<AppSession | NextResponse> {
  const sessionOrResponse = await requireSession(request);
  if (sessionOrResponse instanceof NextResponse) return sessionOrResponse;

  if (!hasPermission(sessionOrResponse.user.role, permission)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return sessionOrResponse;
}

export function sessionToJson(session: AppSession) {
  return {
    authenticated: true,
    authProvider: session.authProvider,
    user: {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      role: session.user.role,
      status: session.user.status,
      picture: session.user.picture ?? null,
    },
    permissions: permissionsForRole(session.user.role),
  };
}

export function accessDeniedPath(reason: AccessDeniedReason): string {
  switch (reason) {
    case "disabled":
      return "/access/disabled";
    case "expired_invite":
      return "/access/invite-expired";
    case "wrong_invite_email":
      return "/access/wrong-email";
    default:
      return "/access/invite-required";
  }
}

export { isAuthDisabled, isAuthEnabled };

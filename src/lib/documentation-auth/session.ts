import "server-only";

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { headers } from "next/headers";

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
import {
  isProvisionalAuth0UserId,
  auth0UserIdForLoginLink,
} from "@/lib/auth0-management/errors";
import { getAuth0 } from "@/lib/auth0";
import {
  acceptInvite,
  applyInviteToExistingUser,
  createUserFromInvite,
  findPendingInviteByEmail,
  findUserByAuth0Id,
  findUserByEmail,
  isValidPendingInvite,
  linkDocumentationUserAuth0Id,
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
  claims?: {
    organizationId?: string;
    authTime?: number;
    amr?: string[];
    acr?: string;
  };
}

export interface AppSessionResult {
  session: AppSession | null;
  accessDenied?: {
    reason: AccessDeniedReason;
    invitedEmail?: string;
  };
  auth0Authenticated?: boolean;
}

function testRoleHeader(request?: NextRequest): string | undefined {
  return request?.headers.get("x-test-role")?.trim() ?? undefined;
}

async function testRoleHeaderFromServer(): Promise<string | undefined> {
  if (!isAuthDisabled()) return undefined;
  try {
    const headerStore = await headers();
    return headerStore.get("x-test-role")?.trim() ?? undefined;
  } catch {
    return undefined;
  }
}

function testRoleFromHeader(header: string | undefined): DocumentationRole {
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

async function testRoleFromRequest(request?: NextRequest): Promise<DocumentationRole> {
  const header = testRoleHeader(request) ?? (await testRoleHeaderFromServer());
  return testRoleFromHeader(header);
}

async function mockSession(request?: NextRequest): Promise<AppSession> {
  const role = await testRoleFromRequest(request);
  const roleHeader = testRoleHeader(request) ?? (await testRoleHeaderFromServer());
  const roleSpecific = Boolean(roleHeader);
  const auth0UserId = roleSpecific
    ? `auth0|local-dev-${role}`
    : isTestAuthMode()
      ? `auth0|test-${role}`
      : "auth0|local-dev";
  return {
    authProvider: isTestAuthMode() ? "test" : "disabled",
    claims: {
      authTime: Math.floor(Date.now() / 1000),
      amr: ["pwd", "mfa"],
      acr: "urn:mfa",
    },
    user: {
      id: roleSpecific
        ? `local-dev-${role}`
        : isTestAuthMode()
          ? `test-user-${role}`
          : "local-dev-user",
      auth0UserId,
      email: roleSpecific
        ? `${role}@dev.local`
        : isTestAuthMode()
          ? `${role}@test.local`
          : "dev@localhost",
      name: roleSpecific ? `Local ${role}` : isTestAuthMode() ? `Test ${role}` : "Local Developer",
      role,
      status: "active",
    },
  };
}

async function resolveAuth0User(request?: NextRequest) {
  const auth0 = getAuth0();
  if (!auth0) return null;
  const authSession = request
    ? await auth0.getSession(request)
    : await auth0.getSession();
  const authUser = authSession?.user;
  if (!authUser?.sub || !authUser.email) return null;

  const idTokenClaims = extractIdTokenClaims(authSession);
  const amrFromUser = Array.isArray(authUser.amr)
    ? authUser.amr.filter((value): value is string => typeof value === "string")
    : undefined;
  const amrFromToken = Array.isArray(idTokenClaims?.amr)
    ? idTokenClaims.amr.filter((value): value is string => typeof value === "string")
    : undefined;

  return {
    sub: authUser.sub,
    email: normalizeEmail(authUser.email),
    name: authUser.name ?? authUser.nickname ?? null,
    picture: authUser.picture ?? null,
    organizationId:
      typeof authUser.org_id === "string"
        ? authUser.org_id
        : typeof idTokenClaims?.org_id === "string"
          ? idTokenClaims.org_id
          : undefined,
    authTime: resolveAuthTime(
      authUser as { auth_time?: unknown },
      idTokenClaims
    ),
    amr: amrFromUser?.length ? amrFromUser : amrFromToken,
    acr:
      typeof authUser.acr === "string"
        ? authUser.acr
        : typeof idTokenClaims?.acr === "string"
          ? idTokenClaims.acr
          : undefined,
  };
}

/** Prefer OIDC auth_time; fall back to ID token iat so step-up checks work after login. */
function resolveAuthTime(
  authUser: { auth_time?: unknown },
  idTokenClaims: Record<string, unknown> | null
): number | undefined {
  if (typeof authUser.auth_time === "number") return authUser.auth_time;
  if (typeof idTokenClaims?.auth_time === "number") return idTokenClaims.auth_time;
  if (typeof idTokenClaims?.iat === "number") return idTokenClaims.iat;
  return undefined;
}

function extractIdTokenClaims(
  authSession: { tokenSet?: { idToken?: string } } | null | undefined
): Record<string, unknown> | null {
  const idToken = authSession?.tokenSet?.idToken;
  if (!idToken) return null;
  const parts = idToken.split(".");
  if (parts.length < 2) return null;
  try {
    const payload = parts[1]!.replace(/-/g, "+").replace(/_/g, "/");
    const padded = payload + "=".repeat((4 - (payload.length % 4)) % 4);
    const json = Buffer.from(padded, "base64").toString("utf8");
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function toAppSession(stored: {
  id: string;
  auth0UserId: string;
  email: string;
  name: string | null;
  role: DocumentationRole;
  status: "active" | "disabled" | "pending";
  picture?: string | null;
}, claims?: AppSession["claims"]): AppSession {
  return {
    authProvider: "auth0",
    claims,
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
    return { session: await mockSession(request) };
  }

  if (!getAuth0()) {
    return { session: null };
  }

  const authUser = await resolveAuth0User(request);
  if (!authUser) {
    return { session: null, auth0Authenticated: false };
  }

  const existingById = await findUserByAuth0Id(authUser.sub);
  const existingByEmail = await findUserByEmail(authUser.email);

  let activeUser = existingById;
  // Link when the workspace already has this email under a different Auth0
  // identity (provisional invite placeholder, or Database user → Okta SSO).
  if (
    !activeUser &&
    existingByEmail &&
    existingByEmail.auth0UserId !== authUser.sub &&
    auth0UserIdForLoginLink(existingByEmail.auth0UserId, authUser.email, authUser.sub) ===
      authUser.sub
  ) {
    // Avoid stealing an identity already bound to another DocumentationUser.
    const subTaken = await findUserByAuth0Id(authUser.sub);
    if (!subTaken) {
      await linkDocumentationUserAuth0Id(existingByEmail.id, authUser.sub);
      activeUser = await findUserByAuth0Id(authUser.sub);
      await logDocumentationAuthEvent({
        action: "auth.auth0_identity_linked",
        userId: existingByEmail.id,
        actorEmail: authUser.email,
        metadata: {
          previousAuth0UserId: existingByEmail.auth0UserId,
          linkedAuth0UserId: authUser.sub,
          provisional: isProvisionalAuth0UserId(existingByEmail.auth0UserId),
        },
      });
    }
  }

  if (activeUser) {
    const pendingInvite = await findPendingInviteByEmail(authUser.email);

    if (activeUser.status === "disabled") {
      if (!pendingInvite || !isValidPendingInvite(pendingInvite)) {
        await logDocumentationAuthEvent({
          action: "auth.blocked_disabled_user",
          userId: activeUser.id,
          actorEmail: authUser.email,
        });
        return {
          session: null,
          auth0Authenticated: true,
          accessDenied: { reason: "disabled" },
        };
      }
    }

    let sessionUser = activeUser;

    if (pendingInvite && isValidPendingInvite(pendingInvite)) {
      const upgraded = await applyInviteToExistingUser({
        userId: activeUser.id,
        role: pendingInvite.role,
        invitedByUserId: pendingInvite.invitedByUserId,
      });
      if (upgraded) {
        sessionUser = upgraded;
        await acceptInvite(pendingInvite.id);
        await logDocumentationAuthEvent({
          action: "auth.invite_accepted",
          userId: upgraded.id,
          actorEmail: upgraded.email,
          metadata: {
            inviteId: pendingInvite.id,
            role: upgraded.role,
            reinvite: true,
          },
        });
      }
    }

    const updated = await updateUserOnLogin({
      auth0UserId: authUser.sub,
      email: authUser.email,
      name: authUser.name,
      picture: authUser.picture,
    });
    sessionUser = updated ?? sessionUser;
    if (sessionUser.status === "disabled") {
      return {
        session: null,
        auth0Authenticated: true,
        accessDenied: { reason: "disabled" },
      };
    }
    await logDocumentationAuthEvent({
      action: "auth.login_success",
      userId: sessionUser.id,
      actorEmail: sessionUser.email,
      metadata: { connection: "auth0" },
    });
    return {
      session: toAppSession(
        { ...sessionUser, name: sessionUser.name ?? null },
        {
          organizationId: authUser.organizationId,
          authTime: authUser.authTime,
          amr: authUser.amr,
          acr: authUser.acr,
        }
      ),
      auth0Authenticated: true,
    };
  }

  // Same email still on a different Auth0 identity after a failed link attempt
  // (provisional hash mismatch, or live sub already owned by another row).
  if (existingByEmail && existingByEmail.auth0UserId !== authUser.sub) {
    await logDocumentationAuthEvent({
      action: "auth.wrong_email_invite_attempt",
      actorEmail: authUser.email,
      metadata: {
        invitedEmail: existingByEmail.email,
        storedAuth0UserId: existingByEmail.auth0UserId,
        liveAuth0UserId: authUser.sub,
      },
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
    session: toAppSession(
      { ...created, name: created.name ?? null },
      {
        organizationId: authUser.organizationId,
        authTime: authUser.authTime,
        amr: authUser.amr,
        acr: authUser.acr,
      }
    ),
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

  return NextResponse.json(
    {
      error: "Session expired — sign in again",
      code: "SESSION_EXPIRED",
      signIn: "/sign-in",
    },
    { status: 401 }
  );
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

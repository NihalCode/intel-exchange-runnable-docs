import "server-only";

import type { AppSession } from "@/lib/documentation-auth/session";
import {
  ANONYMOUS_VIEWER_USER_ID,
  isAnonymousViewerSession,
} from "@/lib/documentation-auth/anonymous-viewer";
import { db, ensureMigrations } from "@/lib/db/client";
import {
  findMembership,
  createMembership,
  listOrganizations,
} from "@/lib/enterprise/repository";
import { OrganizationContextError } from "@/lib/enterprise/organization-context";
import type { OrganizationContext } from "@/lib/enterprise/types";

/**
 * Persist a durable anonymous viewer principal + org membership so feedback
 * rows can satisfy chat_feedback.user_id FK without requiring Auth0.
 */
export async function ensureAnonymousFeedbackPrincipal(
  session: AppSession
): Promise<OrganizationContext> {
  if (!isAnonymousViewerSession(session)) {
    throw new OrganizationContextError();
  }
  ensureMigrations();
  const now = new Date().toISOString();
  const existing = await db.queryOne<{ id: string; status: string; role: string }>(
    `SELECT id, status, role FROM documentation_users WHERE id = ? OR auth0_user_id = ?`,
    [ANONYMOUS_VIEWER_USER_ID, "anonymous|viewer"]
  );
  if (!existing) {
    await db.execute(
      `INSERT INTO documentation_users
         (id, auth0_user_id, email, name, role, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'viewer', 'active', ?, ?)`,
      [
        ANONYMOUS_VIEWER_USER_ID,
        "anonymous|viewer",
        "anonymous@viewer.local",
        "Anonymous viewer",
        now,
        now,
      ]
    );
  } else if (existing.status !== "active") {
    throw new OrganizationContextError();
  }

  const organizations = await listOrganizations();
  if (organizations.length === 0) {
    throw new OrganizationContextError();
  }
  const organization = organizations[0]!;
  let membership = await findMembership(organization.id, ANONYMOUS_VIEWER_USER_ID);
  if (!membership) {
    membership = await createMembership({
      organizationId: organization.id,
      userId: ANONYMOUS_VIEWER_USER_ID,
      role: "viewer",
    });
  } else if (membership.status !== "active") {
    await db.execute(
      `UPDATE organization_memberships
       SET status = 'active', role = 'viewer', updated_at = ?
       WHERE id = ?`,
      [now, membership.id]
    );
    membership = await findMembership(organization.id, ANONYMOUS_VIEWER_USER_ID);
    if (!membership || membership.status !== "active") {
      throw new OrganizationContextError();
    }
  }

  return {
    organization: {
      id: organization.id,
      auth0OrganizationId: organization.auth0OrganizationId,
      slug: organization.slug,
      name: organization.name,
      status: organization.status,
    },
    membership: {
      id: membership.id,
      userId: membership.userId,
      organizationId: membership.organizationId,
      role: membership.role,
      status: membership.status,
      permissions: membership.permissions,
    },
    principal: {
      userId: membership.userId,
      organizationId: organization.id,
      role: "viewer",
      status: "active",
      permissions: membership.permissions,
    },
  };
}

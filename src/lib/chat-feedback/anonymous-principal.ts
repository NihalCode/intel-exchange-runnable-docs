import "server-only";

import type { AppSession } from "@/lib/documentation-auth/session";
import {
  ANONYMOUS_VIEWER_USER_ID,
  isAnonymousViewerSession,
} from "@/lib/documentation-auth/anonymous-viewer";
import { db, ensureMigrations, withOrganizationTransaction } from "@/lib/db/client";
import {
  createMembership,
  findMembership,
  findOrganizationById,
  listOrganizations,
} from "@/lib/enterprise/repository";
import { OrganizationContextError } from "@/lib/enterprise/organization-context";
import type { OrganizationContext } from "@/lib/enterprise/types";

async function ensureAnonymousViewerUser(now: string): Promise<void> {
  const existing = await db.queryOne<{ id: string; status: string }>(
    `SELECT id, status FROM documentation_users WHERE id = ? OR auth0_user_id = ?`,
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
    return;
  }
  if (existing.status !== "active") {
    throw new OrganizationContextError();
  }
}

/**
 * Persist a durable anonymous viewer principal + org membership so feedback
 * rows can satisfy chat_feedback.user_id FK without requiring Auth0.
 *
 * Membership reads/writes run inside an organization-scoped transaction so
 * Postgres RLS on organization_memberships succeeds in production.
 */
export async function ensureAnonymousFeedbackPrincipal(
  session: AppSession
): Promise<OrganizationContext> {
  if (!isAnonymousViewerSession(session)) {
    throw new OrganizationContextError();
  }
  ensureMigrations();
  const now = new Date().toISOString();
  await ensureAnonymousViewerUser(now);

  const organizations = await listOrganizations();
  if (organizations.length === 0) {
    throw new OrganizationContextError();
  }
  const organization = organizations[0]!;

  return withOrganizationTransaction(
    { organizationId: organization.id, userId: ANONYMOUS_VIEWER_USER_ID },
    async (tx) => {
      const org = await findOrganizationById(organization.id, tx);
      if (!org || org.status !== "active") {
        throw new OrganizationContextError();
      }

      let membership = await findMembership(
        organization.id,
        ANONYMOUS_VIEWER_USER_ID,
        tx
      );
      if (!membership) {
        membership = await createMembership(
          {
            organizationId: organization.id,
            userId: ANONYMOUS_VIEWER_USER_ID,
            role: "viewer",
          },
          tx
        );
      } else if (membership.status !== "active") {
        await tx.execute(
          `UPDATE organization_memberships
           SET status = 'active', role = 'viewer', updated_at = ?
           WHERE id = ?`,
          [now, membership.id]
        );
        membership = await findMembership(
          organization.id,
          ANONYMOUS_VIEWER_USER_ID,
          tx
        );
      }
      if (!membership || membership.status !== "active") {
        throw new OrganizationContextError();
      }

      return {
        organization: {
          id: org.id,
          auth0OrganizationId: org.auth0OrganizationId,
          slug: org.slug,
          name: org.name,
          status: org.status,
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
          organizationId: org.id,
          role: "viewer",
          status: "active",
          permissions: membership.permissions,
        },
      };
    }
  );
}

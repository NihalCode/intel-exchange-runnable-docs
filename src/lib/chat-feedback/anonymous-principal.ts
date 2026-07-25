import "server-only";

import type { AppSession } from "@/lib/documentation-auth/session";
import {
  ANONYMOUS_VIEWER_USER_ID,
  isAnonymousViewerSession,
} from "@/lib/documentation-auth/anonymous-viewer";
import {
  ensureMigrations,
  isPostgresConfigured,
  withOrganizationTransaction,
  type DbExecutor,
} from "@/lib/db/client";
import {
  createMembership,
  findMembership,
  findOrganizationById,
  listOrganizations,
} from "@/lib/enterprise/repository";
import { OrganizationContextError } from "@/lib/enterprise/organization-context";
import type { OrganizationContext } from "@/lib/enterprise/types";

const ANONYMOUS_AUTH0_USER_ID = "anonymous|viewer";
const ANONYMOUS_EMAIL = "anonymous@viewer.local";

/**
 * Resolve (or create) the durable documentation_users row for anonymous feedback.
 *
 * Important: never assume the row id is ANONYMOUS_VIEWER_USER_ID. A legacy row may
 * already own auth0/email under a different primary key — membership + chat_feedback
 * FKs must use that real id or Postgres raises organization_memberships_user_id_fkey.
 */
async function resolveAnonymousViewerUserId(
  executor: DbExecutor,
  now: string
): Promise<string> {
  const byCanonicalId = await executor.queryOne<{ id: string; status: string }>(
    `SELECT id, status FROM documentation_users WHERE id = ? LIMIT 1`,
    [ANONYMOUS_VIEWER_USER_ID]
  );
  if (byCanonicalId) {
    if (byCanonicalId.status !== "active") {
      throw new OrganizationContextError();
    }
    return byCanonicalId.id;
  }

  const legacy = await executor.queryOne<{ id: string; status: string }>(
    `SELECT id, status FROM documentation_users
     WHERE auth0_user_id = ? OR lower(email) = lower(?)
     LIMIT 1`,
    [ANONYMOUS_AUTH0_USER_ID, ANONYMOUS_EMAIL]
  );
  if (legacy) {
    if (legacy.status !== "active") {
      throw new OrganizationContextError();
    }
    return legacy.id;
  }

  try {
    await executor.execute(
      `INSERT INTO documentation_users
         (id, auth0_user_id, email, name, role, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'viewer', 'active', ?, ?)`,
      [
        ANONYMOUS_VIEWER_USER_ID,
        ANONYMOUS_AUTH0_USER_ID,
        ANONYMOUS_EMAIL,
        "Anonymous viewer",
        now,
        now,
      ]
    );
  } catch (error) {
    // Concurrent bootstrap: another request won the unique insert — re-resolve.
    const raced = await executor.queryOne<{ id: string; status: string }>(
      `SELECT id, status FROM documentation_users
       WHERE id = ? OR auth0_user_id = ? OR lower(email) = lower(?)
       LIMIT 1`,
      [ANONYMOUS_VIEWER_USER_ID, ANONYMOUS_AUTH0_USER_ID, ANONYMOUS_EMAIL]
    );
    if (raced?.status === "active") {
      return raced.id;
    }
    throw error;
  }

  const created = await executor.queryOne<{ id: string }>(
    `SELECT id FROM documentation_users WHERE id = ? LIMIT 1`,
    [ANONYMOUS_VIEWER_USER_ID]
  );
  if (!created) {
    throw new OrganizationContextError();
  }
  return created.id;
}

/**
 * Persist a durable anonymous viewer principal + org membership so feedback
 * rows can satisfy chat_feedback.user_id FK without requiring Auth0.
 *
 * User + membership writes run inside an organization-scoped transaction so
 * Postgres RLS on organization_memberships succeeds and the user row is visible
 * to the membership FK in the same transaction.
 */
export async function ensureAnonymousFeedbackPrincipal(
  session: AppSession
): Promise<OrganizationContext> {
  if (!isAnonymousViewerSession(session)) {
    throw new OrganizationContextError();
  }
  ensureMigrations();
  const now = new Date().toISOString();

  const organizations = await listOrganizations();
  if (organizations.length === 0) {
    throw new OrganizationContextError();
  }
  const organization = organizations[0]!;

  // Seed RLS identity with the session id; immediately re-bind to the durable
  // documentation_users.id once resolved (may differ on legacy tenants).
  return withOrganizationTransaction(
    { organizationId: organization.id, userId: ANONYMOUS_VIEWER_USER_ID },
    async (tx) => {
      const durableUserId = await resolveAnonymousViewerUserId(tx, now);
      if (
        isPostgresConfigured() &&
        durableUserId !== ANONYMOUS_VIEWER_USER_ID
      ) {
        await tx.query("SELECT set_config('app.user_id', ?, true)", [
          durableUserId,
        ]);
      }

      const org = await findOrganizationById(organization.id, tx);
      if (!org || org.status !== "active") {
        throw new OrganizationContextError();
      }

      let membership = await findMembership(organization.id, durableUserId, tx);
      if (!membership) {
        membership = await createMembership(
          {
            organizationId: organization.id,
            userId: durableUserId,
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
        membership = await findMembership(organization.id, durableUserId, tx);
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

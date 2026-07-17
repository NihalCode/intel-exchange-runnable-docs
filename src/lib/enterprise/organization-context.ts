import "server-only";

import { withOrganizationTransaction, withTransaction } from "@/lib/db/client";
import { createUserFromInvite, findUserByAuth0Id, findUserByEmail } from "@/lib/db/repository";
import type { AppSession } from "@/lib/documentation-auth/session";
import type { DocumentationRole } from "@/lib/documentation-auth/types";
import {
  canBootstrapEnterpriseOrganization,
  mapEnterpriseRole,
} from "@/lib/enterprise/policy";
import {
  countOrganizations,
  createMembership,
  createOrganization,
  findMembership,
  findOrganizationByAuth0Id,
  findOrganizationById,
  listActiveMembershipsForUser,
  listOrganizations,
} from "@/lib/enterprise/repository";
import type { OrganizationContext } from "@/lib/enterprise/types";

export class OrganizationContextError extends Error {
  readonly status: 401 | 403;

  constructor(status: 401 | 403 = 403) {
    super(status === 401 ? "Authentication required" : "Access denied");
    this.name = "OrganizationContextError";
    this.status = status;
  }
}

function contextFrom(
  session: AppSession,
  organization: NonNullable<Awaited<ReturnType<typeof findOrganizationById>>>,
  membership: NonNullable<Awaited<ReturnType<typeof findMembership>>>
): OrganizationContext {
  if (organization.status !== "active" || membership.status !== "active") {
    throw new OrganizationContextError();
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
      userId: session.user.id,
      organizationId: organization.id,
      role: membership.role,
      status: membership.status,
      permissions: membership.permissions,
    },
  };
}

async function verifiedContextForOrganization(
  session: AppSession,
  organizationId: string
): Promise<OrganizationContext> {
  const result = await withOrganizationTransaction(
    { organizationId, userId: session.user.id },
    async (transaction) => {
      const organization = await findOrganizationById(organizationId, transaction);
      const membership = await findMembership(
        organizationId,
        session.user.id,
        transaction
      );
      return organization && membership ? { organization, membership } : null;
    }
  );
  if (!result) throw new OrganizationContextError();
  return contextFrom(session, result.organization, result.membership);
}

async function ensurePersistedSessionUser(session: AppSession): Promise<AppSession> {
  if (session.authProvider !== "disabled" && session.authProvider !== "test") {
    return session;
  }
  const existingByAuth0 = await findUserByAuth0Id(session.user.auth0UserId);
  const existing =
    existingByAuth0 ?? (await findUserByEmail(session.user.email));
  if (existing) {
    return {
      ...session,
      user: {
        ...session.user,
        id: existing.id,
        role: existing.role,
        status: existing.status,
      },
    };
  }
  const created = await createUserFromInvite({
    auth0UserId: session.user.auth0UserId,
    email: session.user.email,
    name: session.user.name,
    role: session.user.role as DocumentationRole,
  });
  return {
    ...session,
    user: {
      ...session.user,
      id: created.id,
      role: created.role,
      status: created.status,
    },
  };
}

/**
 * Resolves organization identity exclusively from trusted server session claims
 * and stored membership. Request headers, query parameters, and request bodies
 * are intentionally not accepted.
 */
export async function resolveOrganizationContext(
  session: AppSession
): Promise<OrganizationContext> {
  const persisted = await ensurePersistedSessionUser(session);
  if (persisted.user.status !== "active") throw new OrganizationContextError();

  const auth0OrganizationId = persisted.claims?.organizationId?.trim();
  if (auth0OrganizationId) {
    const organization = await findOrganizationByAuth0Id(auth0OrganizationId);
    if (!organization) throw new OrganizationContextError();
    return verifiedContextForOrganization(persisted, organization.id);
  }

  const organizations = await listOrganizations();
  if (organizations.length === 1) {
    const existing = await withOrganizationTransaction(
      { organizationId: organizations[0]!.id, userId: persisted.user.id },
      (transaction) =>
        findMembership(organizations[0]!.id, persisted.user.id, transaction)
    );
    if (existing) {
      return contextFrom(persisted, organizations[0]!, existing);
    }

    // Existing single-tenant installs may predate memberships. Only an
    // already-privileged user can bootstrap that one missing relationship.
    const role = mapEnterpriseRole(persisted.user.role);
    if (role && canBootstrapEnterpriseOrganization(role)) {
      const membership = await withTransaction((transaction) =>
        createMembership(
          {
            organizationId: organizations[0]!.id,
            userId: persisted.user.id,
            role,
          },
          transaction
        )
      );
      return contextFrom(persisted, organizations[0]!, membership);
    }
    throw new OrganizationContextError();
  }

  if (organizations.length > 1) {
    const memberships = await listActiveMembershipsForUser(persisted.user.id);
    if (memberships.length === 1) {
      const organization = await findOrganizationById(memberships[0]!.organizationId);
      if (organization) {
        return contextFrom(persisted, organization, memberships[0]!);
      }
    }
    // Auth0 org_id is required when organization choice would be ambiguous.
    throw new OrganizationContextError();
  }

  const role = mapEnterpriseRole(persisted.user.role);
  if (!role || !canBootstrapEnterpriseOrganization(role)) {
    throw new OrganizationContextError();
  }

  const created = await withTransaction(async (transaction) => {
    if ((await countOrganizations(transaction)) !== 0) return null;
    const organization = await createOrganization(
      {
        name: "Default Organization",
        slug: `default-${persisted.user.id.slice(0, 8).toLowerCase()}`,
      },
      transaction
    );
    const membership = await createMembership(
      {
        organizationId: organization.id,
        userId: persisted.user.id,
        role,
      },
      transaction
    );
    return { organization, membership };
  });

  if (!created) throw new OrganizationContextError();
  return contextFrom(persisted, created.organization, created.membership);
}

async function recoverOrganizationContext(session: AppSession): Promise<OrganizationContext> {
  const persisted = await ensurePersistedSessionUser(session);
  if (persisted.user.status !== "active") throw new OrganizationContextError();

  const memberships = await listActiveMembershipsForUser(persisted.user.id);
  if (memberships.length === 1) {
    const organization = await findOrganizationById(memberships[0]!.organizationId);
    if (organization) {
      return contextFrom(persisted, organization, memberships[0]!);
    }
  }

  const enterpriseRole = mapEnterpriseRole(persisted.user.role);
  if (!enterpriseRole || !canBootstrapEnterpriseOrganization(persisted.user.role)) {
    throw new OrganizationContextError();
  }

  const organizations = await listOrganizations();
  if (organizations.length === 1) {
    const existing = await findMembership(organizations[0]!.id, persisted.user.id);
    if (existing?.status === "active") {
      return contextFrom(persisted, organizations[0]!, existing);
    }
    const membership = await withTransaction((transaction) =>
      createMembership(
        {
          organizationId: organizations[0]!.id,
          userId: persisted.user.id,
          role: enterpriseRole,
        },
        transaction
      )
    );
    return contextFrom(persisted, organizations[0]!, membership);
  }

  if (organizations.length === 0) {
    const created = await withTransaction(async (transaction) => {
      if ((await countOrganizations(transaction)) !== 0) return null;
      const organization = await createOrganization(
        {
          name: "Default Organization",
          slug: `default-${persisted.user.id.slice(0, 8).toLowerCase()}`,
        },
        transaction
      );
      const membership = await createMembership(
        {
          organizationId: organization.id,
          userId: persisted.user.id,
          role: enterpriseRole,
        },
        transaction
      );
      return { organization, membership };
    });
    if (created) {
      return contextFrom(persisted, created.organization, created.membership);
    }
  }

  throw new OrganizationContextError();
}

/**
 * Resolves organization context and, for owner/admin cold starts, bootstraps
 * the default organization membership when the strict resolver fails.
 */
export async function resolveOrganizationContextOrBootstrap(
  session: AppSession
): Promise<OrganizationContext> {
  try {
    return await resolveOrganizationContext(session);
  } catch (error) {
    if (!(error instanceof OrganizationContextError)) throw error;
    return recoverOrganizationContext(session);
  }
}

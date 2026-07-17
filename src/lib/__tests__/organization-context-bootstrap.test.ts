import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AppSession } from "@/lib/documentation-auth/session";

const listOrganizations = vi.fn();
const listActiveMembershipsForUser = vi.fn();
const findOrganizationById = vi.fn();
const findOrganizationByAuth0Id = vi.fn();
const findMembership = vi.fn();
const createMembership = vi.fn();
const createOrganization = vi.fn();
const countOrganizations = vi.fn();
const withTransaction = vi.fn();
const withOrganizationTransaction = vi.fn();

vi.mock("@/lib/db/client", () => ({
  withTransaction: (...args: unknown[]) => withTransaction(...args),
  withOrganizationTransaction: (...args: unknown[]) =>
    withOrganizationTransaction(...args),
}));

vi.mock("@/lib/db/repository", () => ({
  createUserFromInvite: vi.fn(),
  findUserByAuth0Id: vi.fn(),
  findUserByEmail: vi.fn(),
}));

vi.mock("@/lib/enterprise/repository", () => ({
  countOrganizations: (...args: unknown[]) => countOrganizations(...args),
  createMembership: (...args: unknown[]) => createMembership(...args),
  createOrganization: (...args: unknown[]) => createOrganization(...args),
  findMembership: (...args: unknown[]) => findMembership(...args),
  findOrganizationByAuth0Id: (...args: unknown[]) => findOrganizationByAuth0Id(...args),
  findOrganizationById: (...args: unknown[]) => findOrganizationById(...args),
  listActiveMembershipsForUser: (...args: unknown[]) =>
    listActiveMembershipsForUser(...args),
  listOrganizations: (...args: unknown[]) => listOrganizations(...args),
}));

import {
  OrganizationContextError,
  resolveOrganizationContextOrBootstrap,
} from "@/lib/enterprise/organization-context";

function ownerSession(): AppSession {
  return {
    authProvider: "auth0",
    user: {
      id: "user-1",
      auth0UserId: "auth0|user-1",
      email: "owner@enterprise.test",
      name: "Owner",
      role: "owner",
      status: "active",
    },
  };
}

describe("resolveOrganizationContextOrBootstrap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    withOrganizationTransaction.mockImplementation(
      async (_ctx: unknown, fn: (tx: unknown) => unknown) => fn({})
    );
    withTransaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn({}));
  });

  it("bootstraps membership for an owner when a single org exists without membership", async () => {
    listOrganizations.mockResolvedValue([
      {
        id: "org-1",
        auth0OrganizationId: null,
        slug: "default-org",
        name: "Default Organization",
        status: "active",
        version: 1,
      },
    ]);
    withOrganizationTransaction.mockImplementation(
      async (_ctx: unknown, fn: (tx: unknown) => unknown) => fn({})
    );
    findMembership.mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: "membership-1",
      organizationId: "org-1",
      userId: "user-1",
      role: "owner",
      status: "active",
      permissions: [],
      version: 1,
    });
    createMembership.mockResolvedValue({
      id: "membership-1",
      organizationId: "org-1",
      userId: "user-1",
      role: "owner",
      status: "active",
      permissions: [],
      version: 1,
    });

    const context = await resolveOrganizationContextOrBootstrap(ownerSession());

    expect(context.organization.id).toBe("org-1");
    expect(context.principal.role).toBe("owner");
    expect(createMembership).toHaveBeenCalled();
  });

  it("uses the sole active membership when multiple organizations exist", async () => {
    listOrganizations.mockResolvedValue([
      {
        id: "org-1",
        auth0OrganizationId: null,
        slug: "org-a",
        name: "Org A",
        status: "active",
        version: 1,
      },
      {
        id: "org-2",
        auth0OrganizationId: null,
        slug: "org-b",
        name: "Org B",
        status: "active",
        version: 1,
      },
    ]);
    listActiveMembershipsForUser.mockResolvedValue([
      {
        id: "membership-1",
        organizationId: "org-2",
        userId: "user-1",
        role: "owner",
        status: "active",
        permissions: [],
        version: 1,
      },
    ]);
    findOrganizationById.mockResolvedValue({
      id: "org-2",
      auth0OrganizationId: null,
      slug: "org-b",
      name: "Org B",
      status: "active",
      version: 1,
    });

    const context = await resolveOrganizationContextOrBootstrap(ownerSession());

    expect(context.organization.id).toBe("org-2");
    expect(createMembership).not.toHaveBeenCalled();
  });

  it("denies viewers without bootstrap", async () => {
    listOrganizations.mockResolvedValue([]);
    listActiveMembershipsForUser.mockResolvedValue([]);

    await expect(
      resolveOrganizationContextOrBootstrap({
        ...ownerSession(),
        user: { ...ownerSession().user, role: "viewer" },
      })
    ).rejects.toBeInstanceOf(OrganizationContextError);
  });
});

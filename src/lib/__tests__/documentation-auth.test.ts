import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";

import { normalizeEmail, isValidEmail } from "@/lib/documentation-auth/email-utils";
import { hashInviteToken, generateInviteToken } from "@/lib/documentation-auth/invite-tokens";
import {
  hasPermission,
  canManageUsers,
  documentationPermissions,
} from "@/lib/documentation-auth/permissions";
import { checkEmailAccess } from "@/lib/documentation-auth/invite-gate";
import { resetRateLimits } from "@/lib/documentation-auth/rate-limit";
import {
  resetDatabaseConnection,
  setTestDatabasePath,
} from "@/lib/db/client";
import {
  acceptInvite,
  clearAllDocumentationAuthData,
  createInvite,
  createUserFromInvite,
  disableUser,
  findInviteByRawToken,
  revokeInvite,
  appendAuditLog,
  listAuditLogs,
} from "@/lib/db/repository";

describe("email normalization", () => {
  it("lowercases and trims emails", () => {
    expect(normalizeEmail("  User@Company.COM ")).toBe("user@company.com");
  });

  it("validates email format", () => {
    expect(isValidEmail("user@company.com")).toBe(true);
    expect(isValidEmail("not-an-email")).toBe(false);
  });
});

describe("invite token hashing", () => {
  it("stores hash not raw token", () => {
    const { rawToken, tokenHash } = generateInviteToken();
    expect(rawToken).toBeTruthy();
    expect(tokenHash).toBe(hashInviteToken(rawToken));
    expect(tokenHash).not.toBe(rawToken);
  });
});

describe("invite gate", () => {
  let dbPath: string;

  beforeEach(async () => {
    resetRateLimits();
    dbPath = path.join(os.tmpdir(), `doc-auth-test-${Date.now()}-${Math.random()}.db`);
    setTestDatabasePath(dbPath);
    resetDatabaseConnection();
    await clearAllDocumentationAuthData();
    delete process.env.DOCUMENTATION_BOOTSTRAP_OWNER_EMAIL;
  });

  afterEach(() => {
    resetDatabaseConnection();
    setTestDatabasePath(null);
    try {
      fs.unlinkSync(dbPath);
    } catch {
      /* ignore */
    }
  });

  it("allows active user", async () => {
    await createUserFromInvite({
      auth0UserId: "auth0|1",
      email: "active@company.com",
      role: "viewer",
    });
    const result = await checkEmailAccess("active@company.com");
    expect(result.allowed).toBe(true);
    expect(result.reason).toBe("active_user");
  });

  it("allows pending valid invite", async () => {
    await createUserFromInvite({
      auth0UserId: "auth0|admin",
      email: "admin@company.com",
      role: "admin",
    });
    await createInvite({
      email: "invited@company.com",
      role: "developer",
      invitedByUserId: "admin-id",
    });
    const result = await checkEmailAccess("invited@company.com");
    expect(result.allowed).toBe(true);
    expect(result.reason).toBe("valid_invite");
    expect(result.role).toBe("developer");
  });

  it("blocks expired invite", async () => {
    await createUserFromInvite({
      auth0UserId: "auth0|admin",
      email: "admin@company.com",
      role: "admin",
    });
    const { invite } = await createInvite({
      email: "expired@company.com",
      role: "viewer",
      invitedByUserId: "x",
      expiryDays: -1,
    });
    expect(invite).toBeTruthy();
    const result = await checkEmailAccess("expired@company.com");
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("expired_invite");
  });

  it("blocks revoked invite", async () => {
    await createUserFromInvite({
      auth0UserId: "auth0|admin",
      email: "admin@company.com",
      role: "admin",
    });
    const { invite } = await createInvite({
      email: "revoked@company.com",
      role: "viewer",
      invitedByUserId: "x",
    });
    await revokeInvite(invite.id);
    const result = await checkEmailAccess("revoked@company.com");
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("not_invited");
  });

  it("blocks disabled user", async () => {
    const user = await createUserFromInvite({
      auth0UserId: "auth0|2",
      email: "disabled@company.com",
      role: "viewer",
    });
    await disableUser(user.id);
    const result = await checkEmailAccess("disabled@company.com");
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("disabled");
  });

  it("blocks uninvited login", async () => {
    const result = await checkEmailAccess("random@gmail.com");
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("not_invited");
  });

  it("assigns role from invite without self-selection", async () => {
    await createUserFromInvite({
      auth0UserId: "auth0|admin",
      email: "admin@company.com",
      role: "admin",
    });
    const { invite, rawToken } = await createInvite({
      email: "new@company.com",
      role: "documentation_manager",
      invitedByUserId: "admin",
    });
    const byToken = await findInviteByRawToken(rawToken);
    expect(byToken?.role).toBe("documentation_manager");
    await acceptInvite(invite.id);
    const again = await findInviteByRawToken(rawToken);
    expect(again?.status).toBe("accepted");
  });

  it("bootstrap owner when no users exist", async () => {
    process.env.DOCUMENTATION_BOOTSTRAP_OWNER_EMAIL = "owner@company.com";
    const result = await checkEmailAccess("owner@company.com");
    expect(result.allowed).toBe(true);
    expect(result.role).toBe("owner");
  });
});

describe("permissions", () => {
  it("viewer cannot manage users or sources", () => {
    expect(canManageUsers("viewer")).toBe(false);
    expect(hasPermission("viewer", "manage_sources")).toBe(false);
    expect(hasPermission("viewer", "read_docs")).toBe(true);
  });

  it("documentation manager can manage sources but not users", () => {
    expect(hasPermission("documentation_manager", "manage_sources")).toBe(true);
    expect(canManageUsers("documentation_manager")).toBe(false);
  });

  it("admin can invite users", () => {
    expect(canManageUsers("admin")).toBe(true);
    expect(hasPermission("admin", "manage_users")).toBe(true);
  });

  it("owner has wildcard permissions", () => {
    expect(documentationPermissions.owner).toEqual(["*"]);
    expect(hasPermission("owner", "manage_users")).toBe(true);
    expect(hasPermission("owner", "view_technical_diagnostics")).toBe(true);
  });
});

describe("audit logs", () => {
  let dbPath: string;

  beforeEach(async () => {
    dbPath = path.join(os.tmpdir(), `doc-audit-test-${Date.now()}.db`);
    setTestDatabasePath(dbPath);
    resetDatabaseConnection();
    await clearAllDocumentationAuthData();
  });

  afterEach(() => {
    resetDatabaseConnection();
    setTestDatabasePath(null);
    try {
      fs.unlinkSync(dbPath);
    } catch {
      /* ignore */
    }
  });

  it("creates audit logs without secrets", async () => {
    await appendAuditLog({
      action: "auth.invite_created",
      userId: "u1",
      actorEmail: "admin@company.com",
      metadata: { invitedEmail: "user@company.com", token: "must-not-store" },
    });
    const logs = await listAuditLogs();
    expect(logs.length).toBe(1);
    expect(logs[0]?.action).toBe("auth.invite_created");
    expect(logs[0]?.metadata).not.toHaveProperty("token");
  });
});

describe("invite-check endpoint security", () => {
  it("does not log tokens in invite generation", () => {
    const spy = vi.spyOn(console, "log");
    const { rawToken } = generateInviteToken();
    expect(rawToken).toBeTruthy();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

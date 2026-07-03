import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";

import { POST as inviteCheckPost } from "@/app/api/auth/invite-check/route";
import { normalizeEmail, isValidEmail } from "@/lib/documentation-auth/email-utils";
import {
  bootstrapOwnerEmail,
  initialOwnerEmail,
  initialOwnerEmailSource,
  isBootstrapOwnerEmail,
  isInitialOwnerEmail,
} from "@/lib/documentation-auth/env";
import { hashInviteToken, generateInviteToken } from "@/lib/documentation-auth/invite-tokens";
import * as inviteGate from "@/lib/documentation-auth/invite-gate";
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
    delete process.env.INITIAL_OWNER_EMAIL;
    delete process.env.DOCUMENTATION_BOOTSTRAP_OWNER_EMAIL;
    delete process.env.INITIAL_ADMIN_EMAIL;
  });

  afterEach(() => {
    resetDatabaseConnection();
    setTestDatabasePath(null);
    delete process.env.INITIAL_OWNER_EMAIL;
    delete process.env.DOCUMENTATION_BOOTSTRAP_OWNER_EMAIL;
    delete process.env.INITIAL_ADMIN_EMAIL;
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

  it("allows re-invite after revoke with a new role", async () => {
    await createUserFromInvite({
      auth0UserId: "auth0|admin",
      email: "admin@company.com",
      role: "admin",
    });
    const { invite: first } = await createInvite({
      email: "reinvite@company.com",
      role: "viewer",
      invitedByUserId: "admin",
    });
    await revokeInvite(first.id);
    await createInvite({
      email: "reinvite@company.com",
      role: "documentation_manager",
      invitedByUserId: "admin",
    });
    const result = await checkEmailAccess("reinvite@company.com");
    expect(result.allowed).toBe(true);
    expect(result.reason).toBe("valid_invite");
    expect(result.role).toBe("documentation_manager");
  });

  it("allows disabled user when a new pending invite exists", async () => {
    await createUserFromInvite({
      auth0UserId: "auth0|admin",
      email: "admin@company.com",
      role: "admin",
    });
    const user = await createUserFromInvite({
      auth0UserId: "auth0|viewer",
      email: "reinvite@company.com",
      role: "viewer",
    });
    await disableUser(user.id);
    await createInvite({
      email: "reinvite@company.com",
      role: "documentation_manager",
      invitedByUserId: "admin",
    });
    const result = await checkEmailAccess("reinvite@company.com");
    expect(result.allowed).toBe(true);
    expect(result.reason).toBe("valid_invite");
    expect(result.role).toBe("documentation_manager");
  });

  it("prefers valid pending invite over revoked invite history", async () => {
    await createUserFromInvite({
      auth0UserId: "auth0|admin",
      email: "admin@company.com",
      role: "admin",
    });
    const { invite: revoked } = await createInvite({
      email: "switch@company.com",
      role: "viewer",
      invitedByUserId: "admin",
    });
    await revokeInvite(revoked.id);
    await createInvite({
      email: "switch@company.com",
      role: "documentation_manager",
      invitedByUserId: "admin",
    });
    const result = await checkEmailAccess("switch@company.com");
    expect(result.allowed).toBe(true);
    expect(result.role).toBe("documentation_manager");
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

  it("allows active owner without pending invite", async () => {
    await createUserFromInvite({
      auth0UserId: "auth0|owner",
      email: "owner@company.com",
      role: "owner",
    });
    const result = await checkEmailAccess("owner@company.com");
    expect(result.allowed).toBe(true);
    expect(result.reason).toBe("active_user");
    expect(result.role).toBe("owner");
  });

  it("bootstrap owner when no active users exist", async () => {
    process.env.INITIAL_OWNER_EMAIL = "owner@company.com";
    const result = await checkEmailAccess("owner@company.com");
    expect(result.allowed).toBe(true);
    expect(result.role).toBe("owner");
    expect(result.reason).toBe("bootstrap_owner");
  });

  it("bootstrap fails after any active user exists", async () => {
    process.env.INITIAL_OWNER_EMAIL = "owner@company.com";
    await createUserFromInvite({
      auth0UserId: "auth0|other",
      email: "other@company.com",
      role: "viewer",
    });
    const result = await checkEmailAccess("owner@company.com");
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("not_invited");
  });

  it("wrong email cannot bootstrap", async () => {
    process.env.INITIAL_OWNER_EMAIL = "owner@company.com";
    const result = await checkEmailAccess("other@company.com");
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("not_invited");
  });

  it("bootstrap owner bypasses revoked invite when zero active users", async () => {
    process.env.INITIAL_OWNER_EMAIL = "owner@company.com";
    const { invite } = await createInvite({
      email: "owner@company.com",
      role: "viewer",
      invitedByUserId: "bootstrap",
    });
    await revokeInvite(invite.id);
    const result = await checkEmailAccess("owner@company.com");
    expect(result.allowed).toBe(true);
    expect(result.role).toBe("owner");
    expect(result.reason).toBe("bootstrap_owner");
  });

  it("bootstrap owner is blocked when explicitly disabled", async () => {
    process.env.INITIAL_OWNER_EMAIL = "owner@company.com";
    await createUserFromInvite({
      auth0UserId: "auth0|backup",
      email: "backup@company.com",
      role: "owner",
    });
    const user = await createUserFromInvite({
      auth0UserId: "auth0|owner",
      email: "owner@company.com",
      role: "owner",
    });
    await disableUser(user.id);
    const result = await checkEmailAccess("owner@company.com");
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("disabled");
  });

  it("bootstrap owner bypasses expired invite when zero active users", async () => {
    process.env.INITIAL_OWNER_EMAIL = "owner@company.com";
    await createInvite({
      email: "owner@company.com",
      role: "viewer",
      invitedByUserId: "admin-id",
      expiryDays: -1,
    });
    const result = await checkEmailAccess("owner@company.com");
    expect(result.allowed).toBe(true);
    expect(result.role).toBe("owner");
    expect(result.reason).toBe("bootstrap_owner");
  });

  it("bootstrap owner when zero active users despite pending invite role", async () => {
    process.env.INITIAL_OWNER_EMAIL = "owner@company.com";
    await createInvite({
      email: "owner@company.com",
      role: "developer",
      invitedByUserId: "admin-id",
    });
    const result = await checkEmailAccess("owner@company.com");
    expect(result.allowed).toBe(true);
    expect(result.role).toBe("owner");
    expect(result.reason).toBe("bootstrap_owner");
  });

  it("bootstrap owner defers to active user record with different role", async () => {
    process.env.INITIAL_OWNER_EMAIL = "owner@company.com";
    await createUserFromInvite({
      auth0UserId: "auth0|owner",
      email: "owner@company.com",
      role: "viewer",
    });
    const result = await checkEmailAccess("owner@company.com");
    expect(result.allowed).toBe(true);
    expect(result.reason).toBe("active_user");
    expect(result.role).toBe("viewer");
  });

  it("matches bootstrap owner when env email is uppercase", async () => {
    process.env.INITIAL_OWNER_EMAIL = "Owner@Company.COM";
    const result = await checkEmailAccess("owner@company.com");
    expect(result.allowed).toBe(true);
    expect(result.role).toBe("owner");
    expect(result.reason).toBe("bootstrap_owner");
  });

  it("reads INITIAL_ADMIN_EMAIL alias", async () => {
    process.env.INITIAL_ADMIN_EMAIL = "admin-owner@company.com";
    const result = await checkEmailAccess("admin-owner@company.com");
    expect(result.allowed).toBe(true);
    expect(result.reason).toBe("bootstrap_owner");
    expect(initialOwnerEmailSource()).toBe("INITIAL_ADMIN_EMAIL");
  });

  it("prefers INITIAL_OWNER_EMAIL over legacy aliases", async () => {
    process.env.INITIAL_OWNER_EMAIL = "primary@company.com";
    process.env.DOCUMENTATION_BOOTSTRAP_OWNER_EMAIL = "legacy@company.com";
    expect(initialOwnerEmail()).toBe("primary@company.com");
    expect(initialOwnerEmailSource()).toBe("INITIAL_OWNER_EMAIL");
  });
});

describe("initialOwnerEmail env aliases", () => {
  beforeEach(() => {
    delete process.env.INITIAL_OWNER_EMAIL;
    delete process.env.DOCUMENTATION_BOOTSTRAP_OWNER_EMAIL;
    delete process.env.INITIAL_ADMIN_EMAIL;
  });

  afterEach(() => {
    delete process.env.INITIAL_OWNER_EMAIL;
    delete process.env.DOCUMENTATION_BOOTSTRAP_OWNER_EMAIL;
    delete process.env.INITIAL_ADMIN_EMAIL;
  });

  it("returns false when env is unset", () => {
    expect(initialOwnerEmail()).toBeNull();
    expect(isInitialOwnerEmail("owner@company.com")).toBe(false);
  });

  it("matches case-insensitively and trims via legacy alias", () => {
    process.env.DOCUMENTATION_BOOTSTRAP_OWNER_EMAIL = "  Owner@Company.COM ";
    expect(bootstrapOwnerEmail()).toBe("owner@company.com");
    expect(isBootstrapOwnerEmail("owner@company.com")).toBe(true);
    expect(isBootstrapOwnerEmail("  OWNER@COMPANY.COM ")).toBe(true);
    expect(isBootstrapOwnerEmail("other@company.com")).toBe(false);
  });

  it("strips wrapping quotes from env value", () => {
    process.env.DOCUMENTATION_BOOTSTRAP_OWNER_EMAIL = '"owner@company.com"';
    expect(initialOwnerEmail()).toBe("owner@company.com");
    expect(isInitialOwnerEmail("owner@company.com")).toBe(true);
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
  const SHARED_SECRET = "test-shared-secret-at-least-32-chars-long";
  let dbPath: string;

  beforeEach(async () => {
    resetRateLimits();
    dbPath = path.join(os.tmpdir(), `invite-check-test-${Date.now()}-${Math.random()}.db`);
    setTestDatabasePath(dbPath);
    resetDatabaseConnection();
    await clearAllDocumentationAuthData();
    process.env.AUTH0_ACTION_SHARED_SECRET = SHARED_SECRET;
    delete process.env.INITIAL_OWNER_EMAIL;
    delete process.env.DOCUMENTATION_BOOTSTRAP_OWNER_EMAIL;
    delete process.env.INITIAL_ADMIN_EMAIL;
  });

  afterEach(() => {
    resetDatabaseConnection();
    setTestDatabasePath(null);
    delete process.env.AUTH0_ACTION_SHARED_SECRET;
    delete process.env.INITIAL_OWNER_EMAIL;
    delete process.env.DOCUMENTATION_BOOTSTRAP_OWNER_EMAIL;
    delete process.env.INITIAL_ADMIN_EMAIL;
    vi.restoreAllMocks();
    try {
      fs.unlinkSync(dbPath);
    } catch {
      /* ignore */
    }
  });

  function inviteCheckRequest(
    body: Record<string, unknown>,
    headers: Record<string, string> = {}
  ): Request {
    return new Request("http://localhost/api/auth/invite-check", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${SHARED_SECRET}`,
        ...headers,
      },
      body: JSON.stringify(body),
    });
  }

  it("does not log tokens in invite generation", () => {
    const spy = vi.spyOn(console, "log");
    const { rawToken } = generateInviteToken();
    expect(rawToken).toBeTruthy();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("returns 503 with auth_config when shared secret is not configured", async () => {
    delete process.env.AUTH0_ACTION_SHARED_SECRET;
    const response = await inviteCheckPost(
      inviteCheckRequest({ email: "user@company.com" })
    );
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.error).toBe("Not configured");
    expect(body.code).toBe("auth_config");
  });

  it("returns 401 for missing or wrong secret", async () => {
    const missing = await inviteCheckPost(
      new Request("http://localhost/api/auth/invite-check", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "user@company.com" }),
      })
    );
    expect(missing.status).toBe(401);

    const wrong = await inviteCheckPost(
      inviteCheckRequest(
        { email: "user@company.com" },
        { authorization: "Bearer wrong-secret-value" }
      )
    );
    expect(wrong.status).toBe(401);
    expect(await wrong.json()).toEqual({ error: "Unauthorized" });
  });

  it("accepts x-auth0-action-secret header", async () => {
    process.env.INITIAL_OWNER_EMAIL = "owner@company.com";
    const response = await inviteCheckPost(
      new Request("http://localhost/api/auth/invite-check", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-auth0-action-secret": SHARED_SECRET,
        },
        body: JSON.stringify({ email: "owner@company.com" }),
      })
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      allowed: true,
      reason: "bootstrap_owner",
      role: "owner",
    });
  });

  it("allows bootstrap owner via invite-check route", async () => {
    process.env.INITIAL_OWNER_EMAIL = "owner@company.com";
    const response = await inviteCheckPost(
      inviteCheckRequest({ email: "owner@company.com" })
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      allowed: true,
      reason: "bootstrap_owner",
      role: "owner",
    });
  });

  it("allows active owner without pending invite via invite-check", async () => {
    await createUserFromInvite({
      auth0UserId: "auth0|owner",
      email: "owner@company.com",
      role: "owner",
    });
    const response = await inviteCheckPost(
      inviteCheckRequest({ email: "owner@company.com" })
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      allowed: true,
      reason: "active_user",
      role: "owner",
    });
  });

  it("falls back to bootstrap owner when checkEmailAccess throws", async () => {
    process.env.INITIAL_OWNER_EMAIL = "owner@company.com";
    vi.spyOn(inviteGate, "checkEmailAccess").mockRejectedValue(new Error("DB unavailable"));

    const response = await inviteCheckPost(
      inviteCheckRequest({ email: "owner@company.com" })
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      allowed: true,
      reason: "bootstrap_owner",
      role: "owner",
    });
  });

  it("returns 503 auth_config when checkEmailAccess throws for non-bootstrap email", async () => {
    vi.spyOn(inviteGate, "checkEmailAccess").mockRejectedValue(new Error("DB unavailable"));

    const response = await inviteCheckPost(
      inviteCheckRequest({ email: "other@company.com" })
    );
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.error).toBe("Database unavailable");
    expect(body.code).toBe("auth_config");
  });

  it("returns blocked result for revoked invite on non-bootstrap email", async () => {
    await createUserFromInvite({
      auth0UserId: "auth0|admin",
      email: "admin@company.com",
      role: "admin",
    });
    const { invite } = await createInvite({
      email: "revoked@company.com",
      role: "viewer",
      invitedByUserId: "admin-id",
    });
    await revokeInvite(invite.id);

    const response = await inviteCheckPost(
      inviteCheckRequest({ email: "revoked@company.com" })
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      allowed: false,
      reason: "not_invited",
    });
  });
});

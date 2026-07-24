/**
 * Anonymous feedback principal + FK-safe conversation refs.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  resetDatabaseConnection,
  setTestDatabasePath,
  db,
} from "@/lib/db/client";
import { createOrganization } from "@/lib/enterprise/repository";
import { anonymousViewerSession } from "@/lib/documentation-auth/anonymous-viewer";
import { ensureAnonymousFeedbackPrincipal } from "@/lib/chat-feedback/anonymous-principal";
import { submitChatFeedback } from "@/lib/chat-feedback/service";
import { OrganizationContextError } from "@/lib/enterprise/organization-context";

describe("anonymous feedback principal", () => {
  let dbDir: string;
  let organizationId: string;
  let prevKey: string | undefined;

  beforeEach(async () => {
    prevKey = process.env.DOCUMENTATION_CREDENTIAL_ENCRYPTION_KEY;
    process.env.DOCUMENTATION_CREDENTIAL_ENCRYPTION_KEY = Buffer.alloc(
      32,
      7
    ).toString("base64");
    dbDir = mkdtempSync(path.join(tmpdir(), "anon-fb-"));
    setTestDatabasePath(path.join(dbDir, "test.sqlite"));
    resetDatabaseConnection();
    const org = await createOrganization({
      name: "Anon FB Org",
      slug: `anon-fb-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    });
    organizationId = org.id;
  });

  afterEach(() => {
    resetDatabaseConnection();
    setTestDatabasePath(null);
    rmSync(dbDir, { recursive: true, force: true });
    if (prevKey === undefined) {
      delete process.env.DOCUMENTATION_CREDENTIAL_ENCRYPTION_KEY;
    } else {
      process.env.DOCUMENTATION_CREDENTIAL_ENCRYPTION_KEY = prevKey;
    }
  });

  it("creates durable anonymous user + membership matching OrganizationContext", async () => {
    const context = await ensureAnonymousFeedbackPrincipal(anonymousViewerSession());
    expect(context.organization.id).toBe(organizationId);
    expect(context.principal.userId).toBe("anonymous-viewer");
    expect(context.principal.organizationId).toBe(organizationId);
    expect(context.principal.role).toBe("viewer");
    expect(context.principal.status).toBe("active");
    expect(context.membership.status).toBe("active");
    expect(context).not.toHaveProperty("session");

    const user = await db.queryOne<{ id: string; status: string }>(
      `SELECT id, status FROM documentation_users WHERE id = ?`,
      ["anonymous-viewer"]
    );
    expect(user?.status).toBe("active");
  });

  it("rejects non-anonymous sessions", async () => {
    await expect(
      ensureAnonymousFeedbackPrincipal({
        ...anonymousViewerSession(),
        user: {
          ...anonymousViewerSession().user,
          id: "real-user",
        },
      })
    ).rejects.toBeInstanceOf(OrganizationContextError);
  });

  it("saves feedback for anonymous principal even with stale conversation ids", async () => {
    const context = await ensureAnonymousFeedbackPrincipal(anonymousViewerSession());
    const row = await submitChatFeedback({
      organizationId: context.organization.id,
      userId: context.principal.userId,
      messageId: "msg-anon-1",
      rating: "up",
      conversationId: "missing-conversation",
      turnId: "missing-turn",
      productId: "ctix",
    });
    expect(row.rating).toBe("up");
    expect(row.userId).toBe("anonymous-viewer");
    expect(row.conversationId).toBeNull();
    expect(row.turnId).toBeNull();
  });
});

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  completeTurnWithFinal,
  createConversation,
  getConversation,
  startTurn,
} from "@/lib/agent/conversation-store";
import { resetDatabaseConnection, setTestDatabasePath } from "@/lib/db/client";
import { createUserFromInvite } from "@/lib/db/repository";
import { createMembership, createOrganization } from "@/lib/enterprise/repository";

describe("agent conversation store", () => {
  let tmpDir = "";
  let organizationId = "";
  let userId = "";
  let otherUserId = "";

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-conversations-"));
    setTestDatabasePath(path.join(tmpDir, "test.db"));
    resetDatabaseConnection();
    const user = await createUserFromInvite({
      auth0UserId: "auth0|conversation-owner",
      email: "conversation-owner@test.local",
      role: "developer",
    });
    const otherUser = await createUserFromInvite({
      auth0UserId: "auth0|conversation-other",
      email: "conversation-other@test.local",
      role: "developer",
    });
    userId = user.id;
    otherUserId = otherUser.id;
    const organization = await createOrganization({
      name: "Conversation Test Org",
      slug: `conversation-test-${Date.now()}`,
    });
    organizationId = organization.id;
    await createMembership({ organizationId, userId, role: "developer" });
    await createMembership({ organizationId, userId: otherUserId, role: "developer" });
  });

  afterEach(() => {
    resetDatabaseConnection();
    setTestDatabasePath(null);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns the existing final message for an idempotent completion", async () => {
    const conversation = await createConversation({ organizationId, userId, title: "Test" });
    const started = await startTurn({
      conversationId: conversation.id,
      orgId: organizationId,
      userId,
      idempotencyKey: "request-1",
      userText: "List indicators",
    });

    const first = await completeTurnWithFinal({
      turnId: started.turn.id,
      organizationId,
      userId,
      contentText: "Here are the indicators.",
    });
    const second = await completeTurnWithFinal({
      turnId: started.turn.id,
      organizationId,
      userId,
      contentText: "A duplicate final must not be saved.",
    });
    const detail = await getConversation(conversation.id, organizationId, userId);

    expect(first.idempotent).toBe(false);
    expect(second.idempotent).toBe(true);
    expect(second.message.id).toBe(first.message.id);
    expect(detail?.messages.filter((message) => message.type === "assistant_final")).toHaveLength(1);
  });

  it("does not expose a conversation across users", async () => {
    const conversation = await createConversation({ organizationId, userId });

    await expect(
      getConversation(conversation.id, organizationId, otherUserId)
    ).resolves.toBeNull();
    await expect(
      startTurn({
        conversationId: conversation.id,
        orgId: organizationId,
        userId: otherUserId,
        idempotencyKey: "other-user-request",
        userText: "Attempt access",
      })
    ).rejects.toThrow("Conversation not found");
  });

  it("does not finalize a turn under another conversation", async () => {
    const first = await createConversation({ organizationId, userId });
    const second = await createConversation({ organizationId, userId });
    const started = await startTurn({
      conversationId: first.id,
      orgId: organizationId,
      userId,
      idempotencyKey: "conversation-mismatch",
      userText: "List indicators",
    });

    await expect(
      completeTurnWithFinal({
        turnId: started.turn.id,
        conversationId: second.id,
        organizationId,
        userId,
        contentText: "This must not be stored.",
      })
    ).rejects.toThrow("Turn does not belong to this conversation");
  });
});

import { randomUUID } from "node:crypto";

import {
  ConversationStoreConflictError,
  startTurn,
} from "@/lib/agent/conversation-store";
import { guardAskAgent } from "@/lib/documentation-auth/guard-api";
import { correlationIds } from "@/lib/enterprise/observability";
import { resolveOrganizationContext } from "@/lib/enterprise/organization-context";

const MAX_USER_TEXT_LENGTH = 32 * 1024;

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await guardAskAgent(request as import("next/server").NextRequest);
  if (session instanceof Response) return session;
  try {
    const body = (await request.json()) as {
      userText?: unknown;
      idempotencyKey?: unknown;
    };
    if (
      typeof body.userText !== "string" ||
      !body.userText.trim() ||
      body.userText.length > MAX_USER_TEXT_LENGTH
    ) {
      return Response.json({ error: "userText is invalid" }, { status: 400 });
    }
    const idempotencyHeader = request.headers.get("idempotency-key")?.trim();
    const idempotencyKey =
      idempotencyHeader ||
      (typeof body.idempotencyKey === "string" ? body.idempotencyKey.trim() : "") ||
      randomUUID();
    if (idempotencyKey.length > 128) {
      return Response.json({ error: "Idempotency key is invalid" }, { status: 400 });
    }
    const [{ id }, context] = await Promise.all([
      params,
      resolveOrganizationContext(session),
    ]);
    const ids = correlationIds(request.headers);
    const result = await startTurn({
      conversationId: id,
      userId: session.user.id,
      orgId: context.organization.id,
      idempotencyKey,
      userText: body.userText,
      requestId: ids.requestId,
    });
    return Response.json(
      { turn: result.turn, userMessage: result.userMessage, idempotent: result.idempotent },
      { status: result.idempotent ? 200 : 201 }
    );
  } catch (error) {
    if (error instanceof ConversationStoreConflictError) {
      return Response.json({ error: "Conversation not found" }, { status: 404 });
    }
    return Response.json({ error: "Unable to start turn" }, { status: 400 });
  }
}

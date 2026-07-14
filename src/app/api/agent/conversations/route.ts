import { randomUUID } from "node:crypto";

import {
  createConversation,
  listConversations,
} from "@/lib/agent/conversation-store";
import { guardAskAgent } from "@/lib/documentation-auth/guard-api";
import { resolveOrganizationContext } from "@/lib/enterprise/organization-context";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await guardAskAgent(request as import("next/server").NextRequest);
  if (session instanceof Response) return session;
  try {
    const context = await resolveOrganizationContext(session);
    const conversations = await listConversations(
      context.organization.id,
      session.user.id
    );
    return Response.json({ conversations });
  } catch {
    return Response.json({ error: "Unable to load conversations" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await guardAskAgent(request as import("next/server").NextRequest);
  if (session instanceof Response) return session;
  try {
    const body = (await request.json()) as { title?: unknown };
    const title =
      typeof body.title === "string" && body.title.trim().length <= 160
        ? body.title.trim()
        : undefined;
    const context = await resolveOrganizationContext(session);
    const conversation = await createConversation({
      organizationId: context.organization.id,
      userId: session.user.id,
      title,
    });
    return Response.json({ conversation, requestId: randomUUID() }, { status: 201 });
  } catch {
    return Response.json({ error: "Unable to create conversation" }, { status: 400 });
  }
}

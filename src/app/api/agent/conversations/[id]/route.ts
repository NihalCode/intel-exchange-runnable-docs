import { getConversation } from "@/lib/agent/conversation-store";
import { guardAskAgent } from "@/lib/documentation-auth/guard-api";
import { resolveOrganizationContext } from "@/lib/enterprise/organization-context";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await guardAskAgent(request as import("next/server").NextRequest);
  if (session instanceof Response) return session;
  try {
    const [{ id }, context] = await Promise.all([
      params,
      resolveOrganizationContext(session),
    ]);
    const conversation = await getConversation(
      id,
      context.organization.id,
      session.user.id
    );
    return conversation
      ? Response.json(conversation)
      : Response.json({ error: "Conversation not found" }, { status: 404 });
  } catch {
    return Response.json({ error: "Unable to load conversation" }, { status: 500 });
  }
}

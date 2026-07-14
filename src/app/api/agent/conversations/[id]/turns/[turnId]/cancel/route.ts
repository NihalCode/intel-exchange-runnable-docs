import { cancelTurn } from "@/lib/agent/conversation-store";
import { guardAskAgent } from "@/lib/documentation-auth/guard-api";
import { resolveOrganizationContext } from "@/lib/enterprise/organization-context";

export const runtime = "nodejs";

/** Marks a persisted turn cancelled; the browser still aborts its active fetch. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; turnId: string }> }
) {
  const session = await guardAskAgent(request as import("next/server").NextRequest);
  if (session instanceof Response) return session;

  const [{ id: conversationId, turnId }, context] = await Promise.all([
    params,
    resolveOrganizationContext(session),
  ]);
  const turn = await cancelTurn(turnId, context.organization.id, session.user.id, conversationId);
  if (!turn) {
    return Response.json({ error: "Turn not found" }, { status: 404 });
  }
  return Response.json({ turn });
}

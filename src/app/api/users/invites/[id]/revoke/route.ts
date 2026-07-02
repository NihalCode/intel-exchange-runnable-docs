import { NextResponse, type NextRequest } from "next/server";

import { logDocumentationAuthEvent } from "@/lib/documentation-auth/audit";
import { requirePermission } from "@/lib/documentation-auth/session";
import { revokeInvite } from "@/lib/db/repository";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const session = await requirePermission("manage_users", request);
  if (session instanceof NextResponse) return session;

  const { id } = await context.params;
  const invite = await revokeInvite(id);
  if (!invite) {
    return NextResponse.json({ error: "Invite not found or not pending" }, { status: 404 });
  }

  await logDocumentationAuthEvent({
    action: "auth.invite_revoked",
    userId: session.user.id,
    actorEmail: session.user.email,
    metadata: { inviteId: id, invitedEmail: invite.email },
  });

  return NextResponse.json({ invite });
}

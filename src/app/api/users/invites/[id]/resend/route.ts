import { NextResponse, type NextRequest } from "next/server";

import { logDocumentationAuthEvent } from "@/lib/documentation-auth/audit";
import { deliverInviteNotification } from "@/lib/documentation-auth/deliver-invite";
import { isInviteEmailConfigured } from "@/lib/documentation-auth/invite-email";
import { getAppBaseUrl } from "@/lib/documentation-auth/env";
import { requirePermission } from "@/lib/documentation-auth/session";
import { buildInviteUrl, resendInvite } from "@/lib/db/repository";
import { requireMutationCsrf } from "@/lib/enterprise/http";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const csrfError = requireMutationCsrf(request);
  if (csrfError) return csrfError;
  const session = await requirePermission("manage_users", request);
  if (session instanceof NextResponse) return session;

  const { id } = await context.params;
  let body: { expiryDays?: number } = {};
  try {
    const text = await request.text();
    if (text) body = JSON.parse(text) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const result = await resendInvite(id, body.expiryDays);
  if (!result) {
    return NextResponse.json({ error: "Invite not found or not pending" }, { status: 404 });
  }

  await logDocumentationAuthEvent({
    action: "auth.invite_resent",
    userId: session.user.id,
    actorEmail: session.user.email,
    metadata: { inviteId: id, invitedEmail: result.invite.email },
  });

  const inviteUrl = buildInviteUrl(result.rawToken, getAppBaseUrl());
  const emailDelivery = isInviteEmailConfigured()
    ? await deliverInviteNotification({
        invite: result.invite,
        inviteUrl,
        invitedByUserId: session.user.id,
        invitedByEmail: session.user.email,
        invitedByName: session.user.name,
        auditAction: "auth.invite_email_resent",
      })
    : null;

  return NextResponse.json({
    invite: result.invite,
    inviteUrl,
    ...(emailDelivery ? { email: emailDelivery } : {}),
  });
}

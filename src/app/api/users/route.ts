import { NextResponse, type NextRequest } from "next/server";

import { logDocumentationAuthEvent } from "@/lib/documentation-auth/audit";
import { deliverInviteNotification } from "@/lib/documentation-auth/deliver-invite";
import { isInviteEmailConfigured } from "@/lib/documentation-auth/invite-email";
import { getAppBaseUrl } from "@/lib/documentation-auth/env";
import { requirePermission } from "@/lib/documentation-auth/session";
import { DOCUMENTATION_ROLES } from "@/lib/documentation-auth/types";
import {
  buildInviteUrl,
  createInvite,
  listInvites,
  listUsers,
} from "@/lib/db/repository";
import { isDocumentationRole } from "@/lib/documentation-auth/permissions";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const session = await requirePermission("manage_users", request);
  if (session instanceof NextResponse) return session;

  const [users, invites] = await Promise.all([listUsers(), listInvites()]);
  return NextResponse.json({
    users,
    invites,
    roles: DOCUMENTATION_ROLES,
  });
}

export async function POST(request: NextRequest) {
  const session = await requirePermission("manage_users", request);
  if (session instanceof NextResponse) return session;

  let body: { email?: string; role?: string; expiryDays?: number };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email = body.email?.trim();
  const role = body.role?.trim();
  if (!email || !role || !isDocumentationRole(role)) {
    return NextResponse.json({ error: "Valid email and role are required" }, { status: 400 });
  }

  const { invite, rawToken } = await createInvite({
    email,
    role,
    invitedByUserId: session.user.id,
    expiryDays: body.expiryDays,
  });

  await logDocumentationAuthEvent({
    action: "auth.invite_created",
    userId: session.user.id,
    actorEmail: session.user.email,
    metadata: { inviteId: invite.id, invitedEmail: invite.email, role: invite.role },
  });

  const inviteUrl = buildInviteUrl(rawToken, getAppBaseUrl());
  const emailDelivery = isInviteEmailConfigured()
    ? await deliverInviteNotification({
        invite,
        inviteUrl,
        invitedByUserId: session.user.id,
        invitedByEmail: session.user.email,
        invitedByName: session.user.name,
        auditAction: "auth.invite_email_sent",
      })
    : null;

  return NextResponse.json({ invite, inviteUrl, ...(emailDelivery ? { email: emailDelivery } : {}) });
}

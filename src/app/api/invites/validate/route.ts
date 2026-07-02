import { NextResponse } from "next/server";

import { logDocumentationAuthEvent } from "@/lib/documentation-auth/audit";
import { checkRateLimit } from "@/lib/documentation-auth/rate-limit";
import {
  findInviteByRawToken,
  isValidPendingInvite,
} from "@/lib/db/repository";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const clientIp =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";

  if (!checkRateLimit(`invite-validate:${clientIp}`, 30)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const url = new URL(request.url);
  const token = url.searchParams.get("token")?.trim();
  if (!token) {
    return NextResponse.json({ valid: false, reason: "missing_token" }, { status: 400 });
  }

  const invite = await findInviteByRawToken(token);
  if (!invite) {
    return NextResponse.json({ valid: false, reason: "not_found" });
  }
  if (invite.status === "revoked") {
    return NextResponse.json({ valid: false, reason: "revoked", email: invite.email });
  }
  if (invite.status === "accepted") {
    return NextResponse.json({ valid: false, reason: "already_accepted", email: invite.email });
  }
  if (invite.status === "expired" || !isValidPendingInvite(invite)) {
    await logDocumentationAuthEvent({
      action: "auth.expired_invite_attempt",
      actorEmail: invite.email,
      metadata: { inviteId: invite.id },
    });
    return NextResponse.json({ valid: false, reason: "expired", email: invite.email });
  }

  return NextResponse.json({
    valid: true,
    email: invite.email,
    role: invite.role,
    expiresAt: invite.expiresAt,
  });
}

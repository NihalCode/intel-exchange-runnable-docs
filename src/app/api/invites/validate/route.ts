import { NextResponse } from "next/server";

import { logDocumentationAuthEvent } from "@/lib/documentation-auth/audit";
import { checkRateLimit } from "@/lib/documentation-auth/rate-limit";
import {
  findInviteByRawToken,
  isValidPendingInvite,
} from "@/lib/db/repository";
import { verifyRecaptchaToken } from "@/lib/recaptcha/verify";
import { resolveTrustedClientIp } from "@/lib/security/client-ip";

export const runtime = "nodejs";

function isPublicRecaptchaEnforced(): boolean {
  return process.env.RECAPTCHA_PROTECTION_ENABLED === "true";
}

export async function GET(request: Request) {
  const clientIp = resolveTrustedClientIp(request.headers) ?? "unknown";

  if (!checkRateLimit(`invite-validate:${clientIp}`, 30)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  // Public invite landing is fail-closed when reCAPTCHA protection is env-enabled.
  if (isPublicRecaptchaEnforced()) {
    const urlForToken = new URL(request.url);
    const recaptchaToken =
      request.headers.get("x-recaptcha-token")?.trim() ||
      urlForToken.searchParams.get("recaptchaToken")?.trim() ||
      null;
    const verified = await verifyRecaptchaToken({
      token: recaptchaToken,
      expectedAction: "public_invite",
      remoteIp: clientIp === "unknown" ? null : clientIp,
      failSoft: false,
    });
    if (!verified.ok) {
      return NextResponse.json(
        { valid: false, reason: "recaptcha_failed", code: "RECAPTCHA_FAILED" },
        { status: 403 }
      );
    }
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

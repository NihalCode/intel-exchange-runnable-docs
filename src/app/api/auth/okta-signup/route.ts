import { NextResponse, type NextRequest } from "next/server";

import { checkEmailAccess } from "@/lib/documentation-auth/invite-gate";
import { checkRateLimit } from "@/lib/documentation-auth/rate-limit";
import { isOktaProvisioningConfigured } from "@/lib/okta/config";
import {
  OktaProvisioningError,
  userFacingOktaProvisioningMessage,
} from "@/lib/okta/errors";
import { requestOktaPasswordSetupForEmail } from "@/lib/okta/users";

export const runtime = "nodejs";

/**
 * First-time Sign up: send Okta password-setup / activation email for an invited address.
 * Does not create an Auth0 session (avoids Sign up ↔ deny loops).
 */
export async function POST(request: NextRequest) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    "unknown";
  if (!checkRateLimit(`okta-signup:${ip}`, 10, 60_000)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  if (!isOktaProvisioningConfigured()) {
    return NextResponse.json(
      {
        error: "Password setup is not available.",
        hint: "Ask an administrator to configure Okta provisioning, or use the activation email from your invite.",
        code: "OKTA_NOT_CONFIGURED",
      },
      { status: 503 }
    );
  }

  let body: { email?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "A valid email is required" }, { status: 400 });
  }

  const access = await checkEmailAccess(email);
  if (!access.allowed) {
    return NextResponse.json(
      {
        error:
          access.reason === "expired_invite"
            ? "Your invite has expired. Ask an administrator to send a new invite."
            : "This email is not invited. Ask an administrator to Add user first.",
        code: access.reason === "expired_invite" ? "expired_invite" : "not_invited",
        hint: "set_password",
      },
      { status: 403 }
    );
  }

  try {
    await requestOktaPasswordSetupForEmail(email);
    return NextResponse.json({
      ok: true,
      setupStatus: "okta_activation_sent",
      message:
        "Check your email to set your password. When you are done, return here and use Sign in.",
      next: "/sign-in?hint=check_email",
    });
  } catch (error) {
    if (error instanceof OktaProvisioningError) {
      const mapped = userFacingOktaProvisioningMessage(error.code, error.detail);
      return NextResponse.json(
        {
          error: mapped.error,
          hint: mapped.hint,
          code: error.code,
          suggestSignUp: true,
        },
        { status: mapped.status }
      );
    }
    return NextResponse.json(
      { error: "Could not start password setup. Try again or ask an administrator." },
      { status: 502 }
    );
  }
}

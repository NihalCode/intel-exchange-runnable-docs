import { NextResponse } from "next/server";

import { cleanEnvValue, isInitialOwnerEmail } from "@/lib/documentation-auth/env";
import { normalizeEmail, isValidEmail } from "@/lib/documentation-auth/email-utils";
import { checkEmailAccess } from "@/lib/documentation-auth/invite-gate";
import { checkRateLimit } from "@/lib/documentation-auth/rate-limit";
import type { InviteCheckResponse } from "@/lib/documentation-auth/types";
import { validateAuthConfig } from "@/lib/documentation-auth/validate-auth-config";
import { secretsEqual } from "@/lib/security/secrets-equal";
import { resolveTrustedClientIp } from "@/lib/security/client-ip";

export const runtime = "nodejs";

interface InviteCheckRequest {
  email?: string;
  auth0UserId?: string;
  connection?: string;
}

function sharedSecret(): string | null {
  return cleanEnvValue(process.env.AUTH0_ACTION_SHARED_SECRET);
}

/** Server-to-server invite gate for Auth0 Post-Login Actions. */
export async function POST(request: Request) {
  const secret = sharedSecret();
  if (!secret) {
    const config = validateAuthConfig();
    return NextResponse.json(
      {
        error: "Not configured",
        code: "auth_config",
        issues: config.issues.filter((i) => i.includes("AUTH0_ACTION_SHARED_SECRET")),
      },
      { status: 503 }
    );
  }

  const authHeader = request.headers.get("authorization")?.trim();
  const bearer = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  const headerSecret = request.headers.get("x-auth0-action-secret")?.trim();
  const provided = bearer ?? headerSecret;

  if (!provided || !secretsEqual(provided, secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const clientIp = resolveTrustedClientIp(request.headers) ?? "unknown";

  if (!checkRateLimit(`invite-check:${clientIp}`)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  let body: InviteCheckRequest;
  try {
    body = (await request.json()) as InviteCheckRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email = body.email?.trim();
  if (!email || !isValidEmail(email)) {
    return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
  }

  const normalized = normalizeEmail(email);

  // Prefer Okta Workforce only — reject unexpected Auth0 connections when configured.
  const expectedConnection = cleanEnvValue(process.env.AUTH0_OKTA_CONNECTION);
  const reportedConnection = body.connection?.trim();
  if (
    expectedConnection &&
    reportedConnection &&
    reportedConnection.toLowerCase() !== expectedConnection.toLowerCase()
  ) {
    return NextResponse.json({
      allowed: false,
      reason: "not_invited",
    } satisfies InviteCheckResponse);
  }

  let result;
  try {
    result = await checkEmailAccess(normalized);
  } catch {
    // DB unavailable — allow initial owner cold-start recovery only.
    if (isInitialOwnerEmail(normalized)) {
      const response: InviteCheckResponse = {
        allowed: true,
        reason: "bootstrap_owner",
        role: "owner",
      };
      return NextResponse.json(response);
    }
    const config = validateAuthConfig();
    return NextResponse.json(
      {
        error: "Database unavailable",
        code: "auth_config",
        issues: config.issues,
      },
      { status: 503 }
    );
  }

  const response: InviteCheckResponse = {
    allowed: result.allowed,
    reason: result.reason,
    role: result.role,
  };

  return NextResponse.json(response);
}

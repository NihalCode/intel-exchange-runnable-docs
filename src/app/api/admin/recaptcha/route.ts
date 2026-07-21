import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { guardEnterpriseApi } from "@/lib/enterprise/guard";
import { getRecaptchaHealthStatus } from "@/lib/recaptcha/verify";

export const runtime = "nodejs";

/** Admin reCAPTCHA status — never returns secrets. */
export async function GET(request: NextRequest) {
  const access = await guardEnterpriseApi(request, "security_settings.manage");
  if (access instanceof NextResponse) {
    const fallback = await guardEnterpriseApi(request, "features.read");
    if (fallback instanceof NextResponse) return access;
  }

  const health = getRecaptchaHealthStatus();
  return NextResponse.json({
    configured: health.configured,
    siteKeyPresent: health.siteKeyPresent,
    secretPresent: health.secretPresent,
    minScore: health.minScore,
    allowedHostnames: health.allowedHostnames,
    allowedActions: health.allowedActions,
    // Never expose secret values or full site key.
    siteKeyHint: health.siteKeyPresent ? "configured" : "missing",
    secretHint: health.secretPresent ? "configured" : "missing",
  });
}

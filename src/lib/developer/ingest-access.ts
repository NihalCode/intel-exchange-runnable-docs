import "server-only";

import { isAuthEnabled } from "@/lib/documentation-auth/config";
import { isDeveloperAccessConfigured } from "@/lib/developer/access";
import { missingDeveloperCredentials } from "@/lib/developer/credential-env";

/** Whether product ingest may run (Auth0 session or legacy developer token path). */
export function canRunProductIngest(productId: string): { allowed: boolean; blockers: string[] } {
  if (isAuthEnabled()) {
    return { allowed: true, blockers: [] };
  }

  const blockers: string[] = [];
  if (!isDeveloperAccessConfigured()) {
    blockers.push("DEVELOPER_ACCESS_TOKEN is not configured.");
  }
  const missing = missingDeveloperCredentials(productId);
  if (missing.length) {
    blockers.push(`Missing credentials: ${missing.join(", ")}`);
  }
  return { allowed: blockers.length === 0, blockers };
}

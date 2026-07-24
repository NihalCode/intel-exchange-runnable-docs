import "server-only";

import { provisionalAuth0UserIdForEmail } from "@/lib/identity/broker-user-id";
import { isOktaProvisioningConfigured } from "@/lib/okta/config";
import { OktaProvisioningError } from "@/lib/okta/errors";
import {
  isBlockedOktaProvisioningOutcome,
  provisionOktaUser,
} from "@/lib/okta/users";

interface ProvisionedUser {
  user_id: string;
  email: string;
  name?: string;
}

export function canProvisionRole(actorRole: string, targetRole: string): boolean {
  if (actorRole === "owner") return true;
  if (actorRole === "admin") return targetRole !== "owner";
  return !["admin", "owner"].includes(targetRole) && actorRole === "documentation_manager";
}

/**
 * Add user: Okta group + status-specific lifecycle, provisional Auth0 broker id for local row.
 */
export async function provisionAuth0User(input: {
  email: string;
  displayName?: string | null;
  auth0OrganizationId?: string | null;
  /** When set (existing local live Auth0 sub), preserve it instead of provisional id. */
  existingAuth0UserId?: string | null;
}): Promise<{
  user: ProvisionedUser;
  created: boolean;
  setupStatus: string;
  hint?: string;
  blocked?: boolean;
}> {
  void input.auth0OrganizationId;

  if (!isOktaProvisioningConfigured()) {
    throw new OktaProvisioningError(
      "OKTA_NOT_CONFIGURED",
      "Set OKTA_ORG_URL, OKTA_API_TOKEN, and OKTA_DOCS_GROUP_ID for Add user."
    );
  }

  let result;
  try {
    result = await provisionOktaUser({
      email: input.email,
      displayName: input.displayName,
    });
  } catch (error) {
    if (error instanceof OktaProvisioningError) throw error;
    throw new OktaProvisioningError(
      "OKTA_USER_PROVISIONING_FAILED",
      error instanceof Error ? error.message : undefined
    );
  }

  const provisional = provisionalAuth0UserIdForEmail(input.email);
  const existing = input.existingAuth0UserId?.trim() || "";
  const userId =
    existing && !existing.startsWith("auth0|invited|") ? existing : provisional;

  return {
    user: {
      user_id: userId,
      email: input.email,
      name: input.displayName ?? undefined,
    },
    created: result.created,
    setupStatus: result.outcome,
    hint: result.hint,
    blocked: isBlockedOktaProvisioningOutcome(result.outcome),
  };
}

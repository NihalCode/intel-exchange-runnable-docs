import "server-only";

import { resolveAppProductId } from "@/lib/deployment/resolve-app-product-id";
import { hasValidCredential } from "@/lib/documentation-credentials/repository";
import { isDocumentationFeatureEnabled } from "@/lib/documentation-features";
import { isProductKey } from "@/lib/products/registry";

/**
 * Whether Ask AI requires a connected Open API product credential.
 * Admin → Features → `require_product_credentials_for_agent` (default on).
 * Env override: AGENT_REQUIRE_PRODUCT_CREDENTIALS=true|false.
 */
export async function agentRequiresProductCredentials(input: {
  organizationId: string;
  role?: string;
}): Promise<boolean> {
  const env = process.env.AGENT_REQUIRE_PRODUCT_CREDENTIALS?.trim().toLowerCase();
  if (env === "false" || env === "0") return false;
  if (env === "true" || env === "1") return true;
  return isDocumentationFeatureEnabled({
    organizationId: input.organizationId,
    key: "require_product_credentials_for_agent",
    role: input.role,
  });
}

/**
 * True when the user may open Ask AI without storing Open API secrets.
 * - Feature / env disabled → always allowed (Auth0 session is enough)
 * - Feature enabled → allowed if they have a valid credential, OR this
 *   deployment is host-pinned to a single product (docs chat for that product)
 */
export async function canUseAgentWithoutStoredProductSecrets(input: {
  organizationId: string;
  userId: string;
  role?: string;
}): Promise<{ allowed: boolean; pinnedProductId: string | null }> {
  const pinned = resolveAppProductId();
  const pinnedProductId = pinned && isProductKey(pinned) ? pinned : null;
  const requireCreds = await agentRequiresProductCredentials({
    organizationId: input.organizationId,
    role: input.role,
  });
  if (!requireCreds) {
    return { allowed: true, pinnedProductId };
  }
  const valid = await hasValidCredential(input.organizationId, input.userId);
  if (valid) return { allowed: true, pinnedProductId };
  if (pinnedProductId) return { allowed: true, pinnedProductId };
  return { allowed: false, pinnedProductId: null };
}

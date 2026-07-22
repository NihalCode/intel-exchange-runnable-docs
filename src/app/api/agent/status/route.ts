import { getOpenAiCredentialStatus } from "@/lib/openai/credentials";
import { guardAskAgent } from "@/lib/documentation-auth/guard-api";
import { isAuthEnabled } from "@/lib/documentation-auth/config";
import { getAgentProductAccess } from "@/lib/documentation-credentials/access";
import { listProducts } from "@/lib/products/registry";
import { resolveOrganizationContext } from "@/lib/enterprise/organization-context";
import { resolveAppProductId } from "@/lib/deployment/resolve-app-product-id";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — authenticated agent credential status (no secrets). */
export async function GET(request: Request) {
  const session = await guardAskAgent(request as import("next/server").NextRequest);
  if (session instanceof Response) return session;

  const pinned = resolveAppProductId();
  let credentialedProducts = pinned
    ? [pinned]
    : listProducts().map((product) => product.productId);
  if (isAuthEnabled() || process.env.NODE_ENV === "production") {
    const context = await resolveOrganizationContext(session);
    const access = await getAgentProductAccess(
      context.organization.id,
      context.principal.userId,
      {
        ensureProductId: pinned,
        isolateToProductId: pinned,
      }
    );
    credentialedProducts = access.productIds;
  }

  return Response.json({
    ok: true,
    openai: getOpenAiCredentialStatus(),
    credentialedProducts,
  });
}

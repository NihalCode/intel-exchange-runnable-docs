import { cancelTurn } from "@/lib/agent/conversation-store";
import { guardAskAgent } from "@/lib/documentation-auth/guard-api";
import { isAuthEnabled } from "@/lib/documentation-auth/config";
import { resolveOrganizationContext } from "@/lib/enterprise/organization-context";
import { requireMutationCsrf } from "@/lib/enterprise/http";
import { correlationIds } from "@/lib/enterprise/observability";
import { trustedHostnameFromHeaders } from "@/lib/domains/request-host";
import { resolveQueryAnalyticsEnabled } from "@/lib/domains/feature-gates-resolve";
import { getResolvedHostContext } from "@/lib/domains/host-context";
import { isProductKey } from "@/lib/products/registry";
import { recordCancellation } from "@/lib/query-analytics/service";
import { resolveAppProductId } from "@/lib/deployment/resolve-app-product-id";

export const runtime = "nodejs";

/** Marks a persisted turn cancelled; the browser still aborts its active fetch. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; turnId: string }> }
) {
  const session = await guardAskAgent(request as import("next/server").NextRequest);
  if (session instanceof Response) return session;
  if (isAuthEnabled()) {
    const csrfFailure = requireMutationCsrf(request as import("next/server").NextRequest);
    if (csrfFailure) return csrfFailure;
  }

  const [{ id: conversationId, turnId }, context] = await Promise.all([
    params,
    resolveOrganizationContext(session),
  ]);
  const turn = await cancelTurn(turnId, context.organization.id, session.user.id, conversationId);
  if (!turn) {
    return Response.json({ error: "Turn not found" }, { status: 404 });
  }

  if (
    await resolveQueryAnalyticsEnabled({
      organizationId: context.organization.id,
      role: session.user.role,
    })
  ) {
    const hostContext = await getResolvedHostContext();
    const pinned = resolveAppProductId();
    const productId =
      pinned ??
      (hostContext?.productId && isProductKey(hostContext.productId)
        ? hostContext.productId
        : null);
    const { requestId } = correlationIds(request.headers);
    // logical_query_id = turn_id (owned turn validated by cancelTurn/getScopedTurn)
    await recordCancellation({
      organizationId: context.organization.id,
      logicalQueryId: turn.id,
      userId: session.user.id,
      conversationId,
      turnId: turn.id,
      hostname: trustedHostnameFromHeaders(request.headers),
      productId,
      requestId,
    });
  }

  return Response.json({ turn });
}

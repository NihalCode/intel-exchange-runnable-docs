import {
  guardAgentFeature,
  guardAskAgent,
} from "@/lib/documentation-auth/guard-api";
import { isAuthEnabled } from "@/lib/documentation-auth/config";
import { checkRateLimit } from "@/lib/documentation-auth/rate-limit";
import { requireMutationCsrf } from "@/lib/enterprise/http";
import {
  classifyQueryOutcome,
  isUnansweredOutcome,
  logicalQueryIdForAnalytics,
} from "@/lib/agent/query-outcome";
import { getAgentProductAccess } from "@/lib/documentation-credentials/access";
import { completeTurnWithFinal } from "@/lib/agent/conversation-store";
import { runAgent } from "@/lib/agent/orchestrate";
import { isAppBuilderQuery } from "@/lib/agent/intent";
import type { AgentRequest } from "@/lib/agent/types";
import { agentLifecycleEvent } from "@/lib/agent/events";
import { resolveOrganizationContext } from "@/lib/enterprise/organization-context";
import { correlationIds } from "@/lib/enterprise/observability";
import { getResolvedHostContext } from "@/lib/domains/host-context";
import { trustedHostnameFromHeaders } from "@/lib/domains/request-host";
import { resolveQueryAnalyticsEnabled } from "@/lib/domains/feature-gates-resolve";
import {
  ensureUnansweredReviewForEvent,
  recordQueryAnalyticsEvent,
} from "@/lib/query-analytics/repository";
import { resolveAppProductId, assertProductAccess } from "@/lib/deployment/resolve-app-product-id";
import { isProductKey } from "@/lib/products/registry";
import { OpenAiNotConfiguredError, sanitizeProviderError } from "@/lib/openai/client";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
// LLM-backed planning/edits can take 20-40s; Vercel's default function
// duration (10s on Hobby) kills the request mid-flight otherwise.
export const maxDuration = 60;

export async function POST(req: Request) {
  const requestId = correlationIds(req.headers).requestId;
  const responseHeaders = { "x-agent-request-id": requestId };
  const session = await guardAskAgent(req as import("next/server").NextRequest);
  if (session instanceof Response) return session;

  if (isAuthEnabled()) {
    const csrfFailure = requireMutationCsrf(req as import("next/server").NextRequest);
    if (csrfFailure) return csrfFailure;
  }

  if (!checkRateLimit(`agent:${session.user.id}`, 30, 60_000)) {
    return Response.json({ error: "Too many requests" }, { status: 429, headers: responseHeaders });
  }

  try {
    const body = (await req.json()) as AgentRequest & { llmApiKey?: string };
    const hasConversationId = typeof body.conversationId === "string" && Boolean(body.conversationId);
    const hasTurnId = typeof body.turnId === "string" && Boolean(body.turnId);
    if (hasConversationId !== hasTurnId) {
      return Response.json(
        { error: "conversationId and turnId must be supplied together" },
        { status: 400, headers: responseHeaders }
      );
    }
    if (
      (hasConversationId && body.conversationId!.length > 128) ||
      (hasTurnId && body.turnId!.length > 128)
    ) {
      return Response.json(
        { error: "Conversation persistence IDs are invalid" },
        { status: 400, headers: responseHeaders }
      );
    }
    if (body.mode === "app" || body.existingApp || isAppBuilderQuery(body.query ?? "")) {
      const featureAccess = await guardAgentFeature(
        req as import("next/server").NextRequest,
        "app_builder"
      );
      if (featureAccess instanceof NextResponse) return featureAccess;
      // Dual-package / Response subclass safety (same pattern as other agent routes).
      if (featureAccess instanceof Response) return featureAccess;
    }
    // Ignore any client-supplied key — OpenAI is server-configured only.
    const { llmApiKey: _ignored, ...agentRequestBody } = body;
    void _ignored;

    const hostContext = await getResolvedHostContext();
    let agentRequest: AgentRequest = agentRequestBody;

    const pinnedProduct = resolveAppProductId();
    if (pinnedProduct) {
      try {
        const requested =
          typeof agentRequest.productId === "string" ? agentRequest.productId : pinnedProduct;
        agentRequest = {
          ...agentRequest,
          productId: assertProductAccess(requested === "all" ? pinnedProduct : requested),
        };
      } catch {
        return Response.json(
          { error: "Product not available on this deployment", code: "PRODUCT_ISOLATION" },
          { status: 403, headers: responseHeaders }
        );
      }
    } else if (
      hostContext?.productId &&
      isProductKey(hostContext.productId) &&
      (!agentRequest.productId || agentRequest.productId === "all")
    ) {
      agentRequest = { ...agentRequest, productId: hostContext.productId };
    }

    let allowedProductIds: string[] | undefined;
    let organizationId: string | undefined;
    if (isAuthEnabled() || process.env.NODE_ENV === "production") {
      const context = await resolveOrganizationContext(session);
      organizationId = context.organization.id;
      const access = await getAgentProductAccess(
        organizationId,
        session.user.id
      );
      allowedProductIds = access.productIds;
    } else if (hasTurnId) {
      organizationId = (await resolveOrganizationContext(session)).organization.id;
    }

    const started = Date.now();
    const result = await runAgent({
      ...agentRequest,
      allowedProductIds,
    });
    if (
      (await resolveQueryAnalyticsEnabled({
        organizationId,
        role: session.user.role,
      })) &&
      organizationId
    ) {
      const outcome = classifyQueryOutcome({
        response: result,
        errorCode: result.code,
        retrievalCount: result.retrieval?.length ?? result.citations.length,
      });
      const eventId = await recordQueryAnalyticsEvent({
        organizationId,
        userId: session.user.id,
        conversationId: body.conversationId ?? null,
        turnId: body.turnId ?? null,
        logicalQueryId: logicalQueryIdForAnalytics(body.turnId, requestId),
        hostname: trustedHostnameFromHeaders(req.headers),
        productId: (() => {
          const candidate =
            typeof agentRequest.productId === "string"
              ? agentRequest.productId
              : result.productContext?.products[0]?.id;
          return candidate && isProductKey(candidate) ? candidate : null;
        })(),
        outcome,
        retrievalResultCount: result.retrieval?.length ?? null,
        citationCount: result.citations.length,
        latencyMs: Date.now() - started,
        requestId,
      });
      if (isUnansweredOutcome(outcome)) {
        await ensureUnansweredReviewForEvent(organizationId, eventId);
      }
    }
    if (hasTurnId && hasConversationId && organizationId) {
      await completeTurnWithFinal({
        turnId: body.turnId!,
        conversationId: body.conversationId!,
        organizationId,
        userId: session.user.id,
        contentText: result.workflow,
        metadata: {
          ...agentLifecycleEvent("turn_final", requestId, {
            conversationId: body.conversationId!,
            turnId: body.turnId!,
          }),
        },
      });
    }
    return Response.json(result, { headers: responseHeaders });
  } catch (err) {
    if (err instanceof OpenAiNotConfiguredError) {
      return Response.json(
        { error: err.clientMessage, code: err.code },
        { status: 503, headers: responseHeaders }
      );
    }
    return Response.json(
      { error: sanitizeProviderError(err, "Agent request failed") },
      { status: 500, headers: responseHeaders }
    );
  }
}

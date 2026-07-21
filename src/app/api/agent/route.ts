import { randomUUID } from "node:crypto";

import {
  guardAskAgent,
} from "@/lib/documentation-auth/guard-api";
import { isAuthEnabled } from "@/lib/documentation-auth/config";
import { checkRateLimit } from "@/lib/documentation-auth/rate-limit";
import { requireMutationCsrf } from "@/lib/enterprise/http";
import {
  classifyQueryOutcome,
  logicalQueryIdForAnalytics,
} from "@/lib/agent/query-outcome";
import { getAgentProductAccess } from "@/lib/documentation-credentials/access";
import {
  completeTurnWithFinal,
  getOwnedTurn,
} from "@/lib/agent/conversation-store";
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
  mintLogicalQueryId,
  recordTerminalAnalyticsSafe,
} from "@/lib/query-analytics/service";
import { resolveAppProductId, assertProductAccess } from "@/lib/deployment/resolve-app-product-id";
import { isProductKey, type ProductKey } from "@/lib/products/registry";
import { OpenAiNotConfiguredError, sanitizeProviderError } from "@/lib/openai/client";
import { isDocumentationFeatureEnabled } from "@/lib/documentation-features";
import { resolveTrustedClientIp } from "@/lib/security/client-ip";
import { deriveCustomerNameSnapshot } from "@/lib/security/customer-name";
import {
  resolveRecaptchaProtectionEnabled,
  resolveUnansweredSensitiveCaptureEnabled,
} from "@/lib/domains/feature-gates-resolve";
import { verifyRecaptchaToken } from "@/lib/recaptcha/verify";

export const runtime = "nodejs";
// LLM-backed planning/edits can take 20-40s; Vercel's default function
// duration (10s on Hobby) kills the request mid-flight otherwise.
export const maxDuration = 60;

async function sensitiveCaptureAllowed(
  organizationId: string | undefined,
  role: string
): Promise<boolean> {
  if (!organizationId) return false;
  return resolveUnansweredSensitiveCaptureEnabled({ organizationId, role });
}

function resolveProductId(
  agentRequest: AgentRequest,
  resultProductId?: string | null
): ProductKey | null {
  const candidate =
    typeof agentRequest.productId === "string" && agentRequest.productId !== "all"
      ? agentRequest.productId
      : resultProductId;
  return candidate && isProductKey(candidate) ? candidate : null;
}

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

  let organizationId: string | undefined;
  let logicalQueryId: string | undefined;
  let attemptId: string | undefined;
  let analyticsHostname: string | undefined;
  let analyticsProductId: ProductKey | null = null;
  let analyticsTurnId: string | null = null;
  let analyticsConversationId: string | null = null;
  let analyticsQueryText: string | null = null;
  let analyticsCustomerName: string | null = null;
  let analyticsEnabled = false;
  let recaptchaDegraded = false;
  const started = Date.now();

  try {
    const body = (await req.json()) as AgentRequest & {
      llmApiKey?: string;
      recaptchaToken?: string | null;
    };
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
    // Fail closed for Build App: check the flag without re-entering guardAskAgent
    // (a second session/feature pass was returning opaque 500s on production).
    if (body.mode === "app" || body.existingApp || isAppBuilderQuery(body.query ?? "")) {
      if (isAuthEnabled() || process.env.NODE_ENV === "production") {
        try {
          const context = await resolveOrganizationContext(session);
          const enabled = await isDocumentationFeatureEnabled({
            organizationId: context.organization.id,
            key: "app_builder",
            role: context.principal.role,
          });
          if (!enabled) {
            return Response.json(
              { error: "Feature unavailable", code: "FEATURE_DISABLED" },
              { status: 403, headers: responseHeaders }
            );
          }
        } catch {
          return Response.json(
            { error: "Feature unavailable", code: "FEATURE_DISABLED" },
            { status: 403, headers: responseHeaders }
          );
        }
      }
    }
    // Ignore any client-supplied key — OpenAI is server-configured only.
    const { llmApiKey: _ignored, ...agentRequestBody } = body;
    void _ignored;

    const hostContext = await getResolvedHostContext();
    let agentRequest: AgentRequest = agentRequestBody;
    analyticsQueryText =
      typeof agentRequest.query === "string" ? agentRequest.query.slice(0, 8_000) : null;

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
    if (isAuthEnabled() || process.env.NODE_ENV === "production") {
      const context = await resolveOrganizationContext(session);
      organizationId = context.organization.id;
      const ensureProductId =
        pinnedProduct ??
        (hostContext?.productId && isProductKey(hostContext.productId)
          ? hostContext.productId
          : null);
      const access = await getAgentProductAccess(
        organizationId,
        session.user.id,
        { ensureProductId }
      );
      allowedProductIds = access.productIds;
    } else if (hasTurnId) {
      organizationId = (await resolveOrganizationContext(session)).organization.id;
    }

    analyticsHostname = trustedHostnameFromHeaders(req.headers);
    analyticsConversationId = hasConversationId ? body.conversationId! : null;
    analyticsCustomerName = deriveCustomerNameSnapshot({
      name: session.user.name,
      email: session.user.email,
    });

    analyticsEnabled =
      Boolean(organizationId) &&
      (await resolveQueryAnalyticsEnabled({
        organizationId,
        role: session.user.role,
      }));

    // Verify reCAPTCHA before model cost when protection is enabled (fail-soft).
    if (organizationId) {
      const recaptchaEnabled = await resolveRecaptchaProtectionEnabled({
        organizationId,
        role: session.user.role,
      });
      if (recaptchaEnabled) {
        const verified = await verifyRecaptchaToken({
          token: body.recaptchaToken,
          expectedAction: "ask_ai_submit",
          remoteIp: resolveTrustedClientIp(req.headers),
          failSoft: true,
        });
        if (!verified.ok) {
          return Response.json(
            { error: "reCAPTCHA verification failed", code: "RECAPTCHA_FAILED" },
            { status: 403, headers: responseHeaders }
          );
        }
        if (verified.degraded) {
          recaptchaDegraded = true;
          if (!checkRateLimit(`agent-recaptcha-degraded:${session.user.id}`, 10, 60_000)) {
            return Response.json(
              { error: "Too many requests" },
              { status: 429, headers: responseHeaders }
            );
          }
        }
      }
    }

    if (analyticsEnabled && organizationId) {
      if (hasTurnId && hasConversationId) {
        const owned = await getOwnedTurn(
          body.turnId!,
          organizationId,
          session.user.id,
          body.conversationId
        );
        if (owned) {
          analyticsTurnId = owned.id;
          logicalQueryId = owned.id;
        } else {
          // Client-supplied turn id is not owned — mint server id; do not bind forged turn.
          logicalQueryId = mintLogicalQueryId();
          analyticsTurnId = null;
        }
      } else {
        logicalQueryId = mintLogicalQueryId();
      }
      attemptId = randomUUID();
      analyticsProductId = resolveProductId(agentRequest);
    }

    const result = await runAgent({
      ...agentRequest,
      allowedProductIds,
    });

    if (analyticsEnabled && organizationId && logicalQueryId && attemptId) {
      const outcome = classifyQueryOutcome({
        response: result,
        errorCode: result.code,
        retrievalCount: result.retrieval?.length ?? result.citations.length,
      });
      analyticsProductId = resolveProductId(
        agentRequest,
        result.productContext?.products[0]?.id
      );
      const captureSensitive = await sensitiveCaptureAllowed(
        organizationId,
        session.user.role
      );
      await recordTerminalAnalyticsSafe({
        organizationId,
        logicalQueryId,
        attemptId,
        userId: session.user.id,
        conversationId: analyticsConversationId,
        turnId: analyticsTurnId,
        hostname: analyticsHostname,
        productId: analyticsProductId,
        collectionId: hostContext?.collectionId ?? null,
        outcome,
        reasonCode: result.code ?? result.retrievalReasonCode ?? null,
        retrievalResultCount: result.retrieval?.length ?? null,
        citationCount: result.citations.length,
        latencyMs: Date.now() - started,
        requestId,
        queryText: captureSensitive ? analyticsQueryText : null,
        clientIp: captureSensitive ? resolveTrustedClientIp(req.headers) : null,
        customerNameSnapshot: analyticsCustomerName,
      });
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
    return Response.json(
      {
        ...result,
        ...(logicalQueryId
          ? {
              analytics: {
                logicalQueryId,
                turnId: analyticsTurnId,
                conversationId: analyticsConversationId,
                attemptId: attemptId ?? null,
              },
            }
          : {}),
        ...(recaptchaDegraded ? { recaptchaDegraded: true } : {}),
      },
      { headers: responseHeaders }
    );
  } catch (err) {
    if (
      analyticsEnabled &&
      organizationId &&
      logicalQueryId &&
      attemptId &&
      analyticsHostname
    ) {
      const errorCode =
        err instanceof OpenAiNotConfiguredError
          ? "OPENAI_NOT_CONFIGURED"
          : "PROVIDER_ERROR";
      const outcome = classifyQueryOutcome({
        errorCode:
          err instanceof OpenAiNotConfiguredError
            ? "PROVIDER_ERROR"
            : "PROVIDER_ERROR",
        httpStatus: err instanceof OpenAiNotConfiguredError ? 503 : 500,
      });
      await recordTerminalAnalyticsSafe({
        organizationId,
        logicalQueryId: logicalQueryIdForAnalytics(analyticsTurnId, logicalQueryId),
        attemptId,
        userId: session.user.id,
        conversationId: analyticsConversationId,
        turnId: analyticsTurnId,
        hostname: analyticsHostname,
        productId: analyticsProductId,
        outcome,
        reasonCode: errorCode,
        latencyMs: Date.now() - started,
        requestId,
        queryText: (await sensitiveCaptureAllowed(organizationId, session.user.role))
          ? analyticsQueryText
          : null,
        clientIp: (await sensitiveCaptureAllowed(organizationId, session.user.role))
          ? resolveTrustedClientIp(req.headers)
          : null,
        customerNameSnapshot: analyticsCustomerName,
      });
    }

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

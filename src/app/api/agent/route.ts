import {
  guardAgentFeature,
  guardAskAgent,
} from "@/lib/documentation-auth/guard-api";
import { isAuthEnabled } from "@/lib/documentation-auth/config";
import { getAgentProductAccess } from "@/lib/documentation-credentials/access";
import { completeTurnWithFinal } from "@/lib/agent/conversation-store";
import { runAgent } from "@/lib/agent/orchestrate";
import type { AgentRequest } from "@/lib/agent/types";
import { agentLifecycleEvent } from "@/lib/agent/events";
import { resolveOrganizationContext } from "@/lib/enterprise/organization-context";
import { correlationIds } from "@/lib/enterprise/observability";
import { OpenAiNotConfiguredError, sanitizeProviderError } from "@/lib/openai/client";

export const runtime = "nodejs";
// LLM-backed planning/edits can take 20-40s; Vercel's default function
// duration (10s on Hobby) kills the request mid-flight otherwise.
export const maxDuration = 60;

export async function POST(req: Request) {
  const requestId = correlationIds(req.headers).requestId;
  const responseHeaders = { "x-agent-request-id": requestId };
  const session = await guardAskAgent(req as import("next/server").NextRequest);
  if (session instanceof Response) return session;

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
    if (body.mode === "app" || body.existingApp) {
      const featureAccess = await guardAgentFeature(
        req as import("next/server").NextRequest,
        "app_builder"
      );
      if (featureAccess instanceof Response) return featureAccess;
    }
    // Ignore any client-supplied key — OpenAI is server-configured only.
    const { llmApiKey: _ignored, ...agentRequest } = body;
    void _ignored;

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

    const result = await runAgent({
      ...agentRequest,
      allowedProductIds,
    });
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

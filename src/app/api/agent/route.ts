import {
  guardAgentFeature,
  guardAskAgent,
} from "@/lib/documentation-auth/guard-api";
import { runAgent } from "@/lib/agent/orchestrate";
import type { AgentRequest } from "@/lib/agent/types";
import { OpenAiNotConfiguredError } from "@/lib/openai/client";

export const runtime = "nodejs";
// LLM-backed planning/edits can take 20-40s; Vercel's default function
// duration (10s on Hobby) kills the request mid-flight otherwise.
export const maxDuration = 60;

export async function POST(req: Request) {
  const session = await guardAskAgent(req as import("next/server").NextRequest);
  if (session instanceof Response) return session;

  try {
    const body = (await req.json()) as AgentRequest & { llmApiKey?: string };
    if (body.mode === "app" || body.existingApp) {
      const featureAccess = await guardAgentFeature(
        req as import("next/server").NextRequest,
        "app_builder"
      );
      if (featureAccess instanceof Response) return featureAccess;
    }
    // Ignore any client-supplied key — OpenAI is server-configured only.
    const { llmApiKey: _ignored, ...agentRequest } = body;
    const result = await runAgent(agentRequest);
    return Response.json(result);
  } catch (err) {
    if (err instanceof OpenAiNotConfiguredError) {
      return Response.json(
        { error: err.clientMessage, code: err.code },
        { status: 503 }
      );
    }
    const message = err instanceof Error ? err.message : "Agent request failed";
    return Response.json({ error: message }, { status: 500 });
  }
}

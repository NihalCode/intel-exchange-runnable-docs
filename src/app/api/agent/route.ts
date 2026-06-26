import { runAgent } from "@/lib/agent/orchestrate";
import type { AgentRequest } from "@/lib/agent/types";
import { OpenAiNotConfiguredError } from "@/lib/openai/client";

export const runtime = "nodejs";
// LLM-backed planning/edits can take 20-40s; Vercel's default function
// duration (10s on Hobby) kills the request mid-flight otherwise.
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as AgentRequest & { llmApiKey?: string };
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

import { runAgent } from "@/lib/agent/orchestrate";
import type { AgentRequest } from "@/lib/agent/types";

export const runtime = "nodejs";
// LLM-backed planning/edits can take 20-40s; Vercel's default function
// duration (10s on Hobby) kills the request mid-flight otherwise.
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as AgentRequest;
    const result = await runAgent(body);
    return Response.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Agent request failed";
    return Response.json({ error: message }, { status: 500 });
  }
}

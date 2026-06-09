import { runAgent } from "@/lib/agent/orchestrate";
import type { AgentRequest } from "@/lib/agent/types";

export const runtime = "nodejs";

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

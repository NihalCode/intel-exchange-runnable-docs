import type { AgentIndex } from "./types";

let cached: AgentIndex | null = null;

export async function loadAgentIndex(): Promise<AgentIndex> {
  if (cached) return cached;
  const mod = await import("@/content/agent-index.json");
  cached = mod.default as unknown as AgentIndex;
  return cached;
}

export function clearAgentIndexCache(): void {
  cached = null;
}

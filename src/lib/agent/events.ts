/**
 * Typed lifecycle vocabulary shared by the request/response agent today and a
 * future SSE transport. These events are intentionally additive: clients
 * should continue to treat the JSON response as the authoritative final data.
 */
export const AGENT_EVENT_TYPES = [
  "request_started",
  "turn_final",
  "request_cancelled",
] as const;

export type AgentEventType = (typeof AGENT_EVENT_TYPES)[number];

export interface AgentLifecycleEvent {
  type: AgentEventType;
  requestId: string;
  conversationId?: string;
  turnId?: string;
}

/** Generates a non-secret correlation ID suitable for request headers. */
export function createAgentRequestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `agent-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function agentLifecycleEvent(
  type: AgentEventType,
  requestId: string,
  ids: Pick<AgentLifecycleEvent, "conversationId" | "turnId"> = {}
): AgentLifecycleEvent {
  return { type, requestId, ...ids };
}

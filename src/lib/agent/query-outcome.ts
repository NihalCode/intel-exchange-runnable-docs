import type { AgentResponse } from "@/lib/agent/types";

export type QueryOutcome =
  | "answered"
  | "partially_answered"
  | "no_verified_solution"
  | "no_results"
  | "clarification_required"
  | "access_blocked"
  | "credential_blocked"
  | "connector_unavailable"
  | "provider_error"
  | "system_error"
  | "cancelled";

export interface QueryOutcomeInput {
  response?: AgentResponse | null;
  httpStatus?: number;
  errorCode?: string;
  cancelled?: boolean;
  retrievalCount?: number;
}

export function classifyQueryOutcome(input: QueryOutcomeInput): QueryOutcome {
  if (input.cancelled) return "cancelled";
  if (input.errorCode === "PRODUCT_AUTH_REQUIRED" || input.errorCode === "credential_blocked") {
    return "credential_blocked";
  }
  if (input.httpStatus === 401 || input.httpStatus === 403 || input.errorCode === "FEATURE_DISABLED") {
    return "access_blocked";
  }
  if (input.errorCode === "CONNECTOR_UNAVAILABLE") return "connector_unavailable";
  if (input.errorCode === "PROVIDER_ERROR") return "provider_error";
  if (input.errorCode === "SYSTEM_ERROR") return "system_error";

  const response = input.response;
  if (!response) return "system_error";

  if (response.questions?.length && response.fallback) {
    return "clarification_required";
  }

  const retrievalCount =
    input.retrievalCount ?? response.retrieval?.length ?? response.citations.length;

  if (response.retrievalEvidence === "no_verified_match" && !response.steps.length) {
    return "no_verified_solution";
  }

  if (retrievalCount === 0 && response.fallback) {
    return "no_results";
  }

  if (response.fallback && response.steps.length > 0) {
    return "partially_answered";
  }

  if (response.fallback) {
    return "no_verified_solution";
  }

  return "answered";
}

export function isUnansweredOutcome(outcome: QueryOutcome): boolean {
  return (
    outcome === "no_verified_solution" ||
    outcome === "no_results" ||
    outcome === "partially_answered"
  );
}

/**
 * One user turn → one logical query for analytics. Prefer the persisted turn id
 * so cancel/retry attempts share a single logical_query_id; fall back to the
 * request correlation id when persistence is unavailable.
 */
export function logicalQueryIdForAnalytics(
  turnId: string | null | undefined,
  requestId: string
): string {
  if (typeof turnId === "string" && turnId.trim()) return turnId.trim();
  return requestId;
}

/**
 * Cancelled attempts are transient; counting them as distinct logical queries
 * would double-count a cancel → retry of the same user turn.
 */
export function countsTowardLogicalQueryMetrics(outcome: QueryOutcome | string): boolean {
  return outcome !== "cancelled";
}

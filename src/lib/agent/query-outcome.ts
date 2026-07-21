import "server-only";

/**
 * Query outcome classification — structured inputs only.
 * Never parse English phrases from workflow text.
 */

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

/** Outcomes that enter the unanswered review queue. */
export const UNANSWERED_OUTCOMES: readonly QueryOutcome[] = [
  "no_verified_solution",
  "no_results",
  "clarification_required",
  "provider_error",
  "system_error",
] as const;

/** Outcomes that contribute to answer-quality denominator. */
export const ANSWER_QUALITY_OUTCOMES: readonly QueryOutcome[] = [
  "answered",
  "partially_answered",
  "no_verified_solution",
  "no_results",
  "clarification_required",
] as const;

export interface QueryOutcomeInput {
  response?: AgentResponse | null;
  httpStatus?: number;
  errorCode?: string;
  cancelled?: boolean;
  retrievalCount?: number;
}

export function classifyQueryOutcome(input: QueryOutcomeInput): QueryOutcome {
  if (input.cancelled) return "cancelled";

  const code = input.errorCode;
  if (code === "PRODUCT_AUTH_REQUIRED" || code === "credential_blocked") {
    return "credential_blocked";
  }
  if (
    input.httpStatus === 401 ||
    input.httpStatus === 403 ||
    code === "FEATURE_DISABLED" ||
    code === "PRODUCT_ISOLATION"
  ) {
    return "access_blocked";
  }
  if (code === "CONNECTOR_UNAVAILABLE") return "connector_unavailable";
  if (code === "PROVIDER_ERROR" || code === "OPENAI_NOT_CONFIGURED") {
    return "provider_error";
  }
  if (code === "SYSTEM_ERROR") return "system_error";

  const response = input.response;
  if (!response) {
    if (input.httpStatus != null && input.httpStatus >= 500) return "system_error";
    if (input.httpStatus != null && input.httpStatus >= 400) return "system_error";
    return "system_error";
  }

  if (response.code === "PRODUCT_AUTH_REQUIRED") return "credential_blocked";
  if (response.code === "FEATURE_DISABLED" || response.code === "PRODUCT_ISOLATION") {
    return "access_blocked";
  }
  if (response.code === "PROVIDER_ERROR") return "provider_error";
  if (response.code === "SYSTEM_ERROR") return "system_error";

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
  return (UNANSWERED_OUTCOMES as readonly string[]).includes(outcome);
}

export function isAnswerQualityOutcome(outcome: QueryOutcome | string): boolean {
  return (ANSWER_QUALITY_OUTCOMES as readonly string[]).includes(outcome);
}

/**
 * One user turn → one logical query for analytics. Prefer the persisted turn id
 * so cancel/retry attempts share a single logical_query_id; fall back to a
 * server-minted id when persistence is unavailable.
 */
export function logicalQueryIdForAnalytics(
  turnId: string | null | undefined,
  fallbackId: string
): string {
  if (typeof turnId === "string" && turnId.trim()) return turnId.trim();
  return fallbackId;
}

/**
 * Cancelled attempts are transient; counting them as distinct logical queries
 * would double-count a cancel → retry of the same user turn.
 */
export function countsTowardLogicalQueryMetrics(outcome: QueryOutcome | string): boolean {
  return outcome !== "cancelled";
}

import type { RetrievalEvidence } from "./types";

const EVIDENCE_LABELS: Record<RetrievalEvidence, string> = {
  strong_match: "Strong documentation match",
  partial_match: "Relevant documentation found",
  limited_evidence: "Limited documentation evidence",
  no_verified_match: "No verified documentation match",
};

/**
 * Converts retrieval evidence into concise, non-numeric copy for the chat UI.
 * Similarity-derived confidence values are intentionally not user-facing.
 */
export function evidenceLabel(evidence?: RetrievalEvidence): string | undefined {
  return evidence ? EVIDENCE_LABELS[evidence] : undefined;
}

/** True when retrieval evidence itself is weak — aligns with {@link evidenceLabel}. */
export function isLowEvidence(evidence?: RetrievalEvidence): boolean {
  return evidence === "limited_evidence" || evidence === "no_verified_match";
}

/**
 * Whether the amber "Low confidence match" banner should appear.
 *
 * Must stay coherent with the evidence badge: do not show for strong/partial
 * matches that still have a usable remaining step (e.g. after validation drops
 * an invalid sibling step). Show for weak evidence or true unsupported / empty
 * answers when `fallback` is set.
 */
export function shouldShowLowConfidenceBanner(opts: {
  fallback?: boolean;
  retrievalEvidence?: RetrievalEvidence;
  stepCount?: number;
}): boolean {
  const { fallback = false, retrievalEvidence, stepCount = 0 } = opts;

  if (isLowEvidence(retrievalEvidence)) return true;

  if (
    (retrievalEvidence === "strong_match" || retrievalEvidence === "partial_match") &&
    stepCount > 0
  ) {
    return false;
  }

  return fallback;
}

/** Copy shown only when vector retrieval has fallen back to the local index. */
export function degradedRetrievalNotice(retrievalDegraded?: boolean): string | undefined {
  return retrievalDegraded
    ? "Documentation search is using the local index, so results may be more limited."
    : undefined;
}

/** Keep internal routing states out of the user-visible progress indicator. */
export function progressLabel(label?: string | null): string {
  if (!label || /\b(?:unknown|router|intent)\b/i.test(label)) {
    return "Working on your request…";
  }
  return label;
}

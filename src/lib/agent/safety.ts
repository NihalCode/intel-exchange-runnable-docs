const FABRICATION_INJECTION =
  /\b(?:ignore|disregard|override)\b[\s\S]{0,120}\b(?:previous|instructions?|rules?|documentation|docs)\b[\s\S]{0,220}\b(?:fabricate|invent|make up|hallucinate|working endpoint)\b/i;

/**
 * Detect a narrow class of explicit instruction-override requests to invent API
 * behavior. This is intentionally conservative: normal undocumented-feature
 * questions continue through retrieval and can receive an evidence abstention.
 */
export function isFabricationPromptInjection(query: string): boolean {
  if (FABRICATION_INJECTION.test(query)) return true;
  // Shorter adversarial form used in demo validation.
  return (
    /\bignoring?\b[\s\S]{0,80}\b(?:docs?|documentation)\b/i.test(query) &&
    /\b(?:invent|fabricate|make up)\b/i.test(query)
  );
}

export function fabricationRefusal(): string {
  return (
    "I can’t fabricate or present an undocumented API endpoint as real. " +
    "I can help find a documented endpoint or explain that the requested operation is unavailable."
  );
}

export function isZendeskSupportQuery(query: string): boolean {
  return /\b(?:zendesk|support tickets?|support cases?)\b/i.test(query);
}

export function supportSearchUnavailable(): string {
  return "Zendesk support search is unavailable because the Support Agent feature is not enabled.";
}

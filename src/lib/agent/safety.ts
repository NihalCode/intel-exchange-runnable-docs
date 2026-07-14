const FABRICATION_INJECTION =
  /\b(?:ignore|disregard|override)\b[\s\S]{0,120}\b(?:previous|instructions?|rules?|documentation|docs)\b[\s\S]{0,220}\b(?:fabricate|invent|make up|hallucinate|working endpoint|guess)\b/i;

const FABRICATION_SHORT =
  /\b(?:invent|fabricate|make up|just guess)\b[\s\S]{0,80}\b(?:endpoint|parameter|path|example|url)\b/i;

const SECRET_DISCLOSURE =
  /\b(?:reveal|show|return|dump|print|exfiltrate)\b[\s\S]{0,80}\b(?:api\s*key|secret\s*key|access\s*id|stored\s+(?:api\s*)?key|password|token|credentials?)\b/i;

const INSTRUCTION_OVERRIDE_SECRETS =
  /\b(?:document|ticket|response|message)\b[\s\S]{0,120}\b(?:reveal|return|show)\b[\s\S]{0,80}\b(?:api\s*key|secret|token|credentials?)\b/i;

const DANGEROUS_SIDE_EFFECT =
  /\b(?:ignore|disregard|override)\b[\s\S]{0,100}\b(?:permission|authorization|tenant|isolation)\b|\b(?:use another tenant['’]?s?|disable permission|call the deployment tool|execute a delete)\b/i;

/**
 * Detect a narrow class of explicit instruction-override requests to invent API
 * behavior. This is intentionally conservative: normal undocumented-feature
 * questions continue through retrieval and can receive an evidence abstention.
 */
export function isFabricationPromptInjection(query: string): boolean {
  if (FABRICATION_INJECTION.test(query) || FABRICATION_SHORT.test(query)) return true;
  return (
    /\bignoring?\b[\s\S]{0,80}\b(?:docs?|documentation)\b/i.test(query) &&
    /\b(?:invent|fabricate|make up|guess)\b/i.test(query)
  );
}

export function fabricationRefusal(): string {
  return (
    "I can’t fabricate or present an undocumented API endpoint as real. " +
    "I can help find a documented endpoint or explain that the requested operation is unavailable."
  );
}

/** Refuse attempts to exfiltrate secrets or override safety via poisoned context. */
export function isSecretDisclosureInjection(query: string): boolean {
  return SECRET_DISCLOSURE.test(query) || INSTRUCTION_OVERRIDE_SECRETS.test(query);
}

export function secretDisclosureRefusal(): string {
  return (
    "I can’t reveal API keys, secrets, or credentials. " +
    "Use Authentication / API Settings in this app to manage your own product credentials securely."
  );
}

export function isDangerousSideEffectInjection(query: string): boolean {
  return DANGEROUS_SIDE_EFFECT.test(query);
}

export function dangerousSideEffectRefusal(): string {
  return (
    "I can’t override permissions, switch tenants, or run unauthorized side effects. " +
    "Ask about a documented Cyware API workflow instead."
  );
}

export function isZendeskSupportQuery(query: string): boolean {
  return /\b(?:zendesk|support tickets?|support cases?|search support)\b/i.test(query);
}

export function supportSearchUnavailable(): string {
  return "Zendesk support search is unavailable because the Support Agent feature is not enabled.";
}

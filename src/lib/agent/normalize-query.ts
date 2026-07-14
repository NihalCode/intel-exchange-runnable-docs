/**
 * Simpler-prompt support for non-technical users.
 *
 * Maps casual, everyday phrasing to the canonical CTIX vocabulary used in the
 * docs, so retrieval still finds the right endpoints. This is a deterministic
 * synonym/intent layer (no extra LLM call). The expanded query is used ONLY for
 * retrieval — the user's original wording is preserved everywhere it is shown.
 */

interface SynonymRule {
  /** Matches casual phrasing in the user's query. */
  pattern: RegExp;
  /** Canonical doc terms appended to the retrieval query when matched. */
  expand: string[];
}

const SYNONYM_RULES: SynonymRule[] = [
  { pattern: /\b(label|labels)\b/i, expand: ["tag", "tags"] },
  { pattern: /\b(show|see|view|display|get me|list out|whats|what's|what are)\b/i, expand: ["list"] },
  { pattern: /\b(make|new|add a|create a)\b/i, expand: ["create"] },
  { pattern: /\b(bad|malicious|suspicious|threat|threats|ioc|iocs)\b/i, expand: ["indicator", "threat data"] },
  { pattern: /\b(ip|ips|domain|domains|url|urls|hash|hashes)\b/i, expand: ["indicator", "ioc_type"] },
  { pattern: /\b(tag it|apply tag|attach tag)\b/i, expand: ["bulk add tags", "add_tag"] },
  { pattern: /\b(import|upload|bring in|load)\b/i, expand: ["import intel", "stix"] },
  { pattern: /\b(feed|feeds)\b/i, expand: ["source collections"] },
  { pattern: /\b(rule|rules)\b/i, expand: ["rules"] },
  { pattern: /\b(alerts?)\b/i, expand: ["list_alert", "analyst portal alerts"] },
  { pattern: /\b(members?|users?)\b/i, expand: ["member list", "member-list-analyst"] },
  { pattern: /\b(incidents?|cases?)\b/i, expand: ["get list of incidents", "cftr incident"] },
  { pattern: /\b(apps?|integrations?)\b/i, expand: ["get apps", "integrations"] },
  { pattern: /\bplaybooks?\b/i, expand: ["get playbook", "playbook filter", "list playbooks"] },
  { pattern: /\b(tags?|labels?)\b/i, expand: ["list tags", "get tags"] },
  { pattern: /\b(test|check connection|is it working|ping|health)\b/i, expand: ["ping"] },
  { pattern: /\b(delete|remove|get rid of)\b/i, expand: ["delete", "remove"] },
  { pattern: /\b(update|change|edit|rename)\b/i, expand: ["update"] },
  {
    pattern: /\b(threat\s*mailbox|email\s*(message|feed|source)s?)\b/i,
    expand: ["threat mailbox", "email deep search", "search url"],
  },
  {
    pattern: /\b(report|reports)\b.*\b(download|file|attachment)\b|\b(download|get)\b.*\b(report|intel)\b.*\b(file|attachment)\b/i,
    expand: ["reports download file", "external download", "file_id token"],
  },
  {
    pattern: /\blast\s+\d+\s+days?\b|\blast\s+week\b|\blast\s+month\b|\byesterday\b|\bpast\s+\d+\s+days?\b/i,
    expand: ["ctix_created", "date filter", "list threat data"],
  },
];

/**
 * Rewrite casual NOUNS to the canonical vocabulary the rule-based intent
 * detectors expect (e.g. "label" -> "tag", "bad ips" -> "indicator"). Unlike
 * `expandQueryForRetrieval`, this returns a clean rewritten query (not appended
 * hints) so intent regexes and tag-name extraction work for laypeople. Names in
 * quotes or after "called/named" are preserved.
 */
const INTENT_REWRITES: [RegExp, string][] = [
  [/\blabels\b/gi, "tags"],
  [/\blabel\b/gi, "tag"],
  [/\bbad\s+(ips?|domains?|urls?|hashes?|files?)\b/gi, "indicators"],
  [/\bmalicious\b/gi, "indicator"],
  [/\biocs\b/gi, "indicators"],
  [/\bioc\b/gi, "indicator"],
];

export function canonicalizeIntent(query: string): string {
  let q = query;
  for (const [re, rep] of INTENT_REWRITES) q = q.replace(re, rep);
  return q;
}

const PRODUCT_EXPANSIONS: Record<string, { pattern: RegExp; expand: string[] }[]> = {
  ctix: [
    { pattern: /\b(tags?|labels?)\b/i, expand: ["list tags", "ingestion/tags", "get tags list"] },
    {
      pattern: /\b(indicators?|threat\s*data|iocs?|bad\s+(ips?|domains?|urls?))\b/i,
      expand: ["list threat data", "threat-data/list", "ingestion/threat-data/list"],
    },
    { pattern: /\b(ping|connectivity|connection)\b/i, expand: ["ping", "test connectivity"] },
  ],
  csap: [
    { pattern: /\b(alerts?)\b/i, expand: ["list_alert", "alerts-list-analyst-member", "analyst portal alerts"] },
    { pattern: /\b(members?|users?)\b/i, expand: ["member-list-analyst", "csap/v1/member"] },
    {
      pattern: /\b(intel\s*)?(categories?|category)\b/i,
      expand: ["intel-categories-list", "intel category"],
    },
    { pattern: /\b(ping|connectivity|connection|credentials?)\b/i, expand: ["test connectivity"] },
  ],
  orchestrate: [
    { pattern: /\b(tags?|labels?)\b/i, expand: ["get list of tags", "v1/tags", "orchestrate tags"] },
    { pattern: /\b(apps?|integrations?)\b/i, expand: ["get apps", "v1/apps", "integrations"] },
    {
      pattern: /\bplaybooks?\b/i,
      expand: ["get playbook", "v1/playbook/filter", "list playbooks"],
    },
    { pattern: /\b(version|release)\b/i, expand: ["product release version", "release_version"] },
    { pattern: /\b(ping|connectivity|connection|credentials?)\b/i, expand: ["test connectivity"] },
  ],
  cftr: [
    { pattern: /\b(incidents?|cases?)\b/i, expand: ["get list of incidents", "v1/incident", "cftrapi"] },
    { pattern: /\b(ping|connectivity|connection|credentials?)\b/i, expand: ["test connectivity"] },
  ],
};

/** Expand casual phrasing into a retrieval query enriched with canonical terms. */
export function expandQueryForRetrieval(query: string, productId?: string): string {
  const extra = new Set<string>();
  for (const rule of SYNONYM_RULES) {
    if (rule.pattern.test(query)) {
      for (const term of rule.expand) extra.add(term);
    }
  }

  if (productId && productId !== "all") {
    extra.add(productId);
    if (productId === "ctix") extra.add("intel exchange");
    if (productId === "csap") extra.add("collaborate analyst portal");
    if (productId === "orchestrate") extra.add("cyware orchestrate playbook");
    if (productId === "cftr") extra.add("cftr incident case");

    for (const rule of PRODUCT_EXPANSIONS[productId] ?? []) {
      if (rule.pattern.test(query)) {
        for (const term of rule.expand) extra.add(term);
      }
    }
  }

  if (extra.size === 0) return query;
  return `${query} ${[...extra].join(" ")}`;
}

/**
 * Heuristic: is the prompt too vague to plan confidently? Used to nudge
 * non-technical users with a friendly clarifying question instead of guessing.
 */
export function isVagueQuery(query: string): boolean {
  const q = query.trim().toLowerCase();
  if (q.length < 4) return true;
  const words = q.split(/\s+/).filter(Boolean);
  if (words.length <= 1) return true;
  // Greetings / meta with no actionable object.
  const objectWords =
    /\b(tag|tags|label|indicator|threat|ioc|ip|domain|url|hash|group|feed|source|collection|rule|alert|intel|stix|object|data|ping)\b/i;
  const actionWords = /\b(list|show|see|view|create|make|add|attach|import|upload|delete|remove|update|change|find|search|verify|check|get)\b/i;
  return !objectWords.test(q) && !actionWords.test(q);
}

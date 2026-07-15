/**
 * Deterministic response-style / depth classifier.
 * Does not change product scope, permissions, or retrieval — presentation only.
 */

export type ResponseStyleMode =
  | "quick"
  | "standard"
  | "detailed"
  | "snippet"
  | "comparison"
  | "troubleshooting"
  | "clarification"
  | "conceptual";

export type SnippetLanguage =
  | "curl"
  | "python"
  | "javascript"
  | "typescript"
  | "java"
  | "csharp"
  | "json"
  | "cql"
  | "other";

export interface ResponseStyleDecision {
  mode: ResponseStyleMode;
  requestedDetail: "minimal" | "normal" | "detailed";
  snippet: {
    requested: boolean;
    required: boolean;
    language?: SnippetLanguage;
  };
  preferredStructure: "direct" | "bullets" | "steps" | "table" | "code_first";
  maxSections: number;
  /** When false, do not attach workflow scripts or force code into prose. */
  includeCode: boolean;
  /** When false, hide dense per-step API tables unless user asked for detail. */
  showTechnicalDetails: boolean;
  reasonCode: string;
}

// A single noun list shared across alternations below. NOUN_END is used instead
// of a trailing `\b` because `\b` does not work after a symbol like "c#" (no
// word/non-word transition between "#" and the following punctuation/space).
const CODE_NOUN =
  "(?:snippet|code|example|sample|curl|python|javascript|typescript|java|c#|csharp|cql|json|payload|body)";
const NOUN_END = "(?=[^a-zA-Z0-9]|$)";

const SNIPPET_REQUEST = new RegExp(
  [
    // "give/show/write/generate/provide/create [me] [a/an/the] [<=2 filler words] <noun>"
    // The filler words let a bare language name ("give me a Python snippet") or a
    // style descriptor ("show a Postman-style example") sit between the article and
    // the noun without requiring every phrasing to be enumerated explicitly.
    `\\b(?:give|show|write|generate|provide|create)\\b(?:\\s+me)?\\s+(?:(?:a|an|the)\\s+)?(?:[\\w#-]+\\s+){0,2}${CODE_NOUN}${NOUN_END}`,
    `\\b(?:code|snippet|curl|python|javascript|typescript|java|c#|csharp)\\s+example\\b`,
    `\\b(?:request|payload|json)\\s+example\\b`,
    `\\bsample\\s+(?:request|response|payload)\\b`,
    `\\bcql\\s+query\\b`,
    `\\bimplementation\\s+example\\b`,
    `\\bonly\\s+(?:the\\s+)?${CODE_NOUN}${NOUN_END}`,
    `\\bgive\\s+me\\s+${CODE_NOUN}${NOUN_END}`,
    `\\bshow\\s+(?:me\\s+)?${CODE_NOUN}${NOUN_END}`,
  ].join("|"),
  "i"
);

const ONLY_CODE =
  /\bonly\s+(?:the\s+)?(?:code|curl|python|javascript|typescript|snippet)\b|\bno\s+explanation\b|\bjust\s+(?:the\s+)?(?:code|curl|snippet)\b/i;

const BREVITY =
  /\b(?:short\s+answer|briefly|concise|just\s+tell\s+me|only\s+the\s+endpoint|one\s+sentence)\b/i;

const DETAIL =
  /\b(?:explain\s+fully|detailed|in\s+(?:full\s+|complete\s+|great\s+)?detail|step\s*[- ]by\s*[- ]step|deep\s+dive|production\s+ready|include\s+edge\s+cases|complete\s+workflow)\b/i;

const TROUBLESHOOT =
  /\b(?:404|401|403|422|429|500|error|fail(?:ed|ing)?|broken|not\s+work(?:ing)?|after\s+(?:an?\s+)?upgrade|why\s+(?:am\s+i|do\s+i)|what\s+should\s+i\s+check)\b/i;

const COMPARISON = /\b(?:compare|difference|vs\.?|versus|between)\b/i;

const CONCEPTUAL =
  /^(?:what\s+(?:is|are|does|do)\b|explain\b)|(?:\bin\s+plain\s+english\b|\blike\s+i(?:'?m|\s+am)\s+not\s+(?:a\s+)?developer\b)/i;

const ENDPOINT_ONLY =
  /\b(?:exact\s+)?(?:method\s+and\s+path|http\s+method|endpoint\s+path|only\s+the\s+endpoint)\b/i;

const HANDOFF =
  /\b(for my )?(it team|api team|dev(?:eloper)? team)\b|\bhand\s*(?:this\s*)?off\b|\bshare (?:this )?with (?:my )?(?:team|developer)/i;

function detectSnippetLanguage(query: string): SnippetLanguage | undefined {
  if (/\bcurl\b/i.test(query)) return "curl";
  if (/\btypescript\b|\b.tsx?\b/i.test(query)) return "typescript";
  if (/\bjavascript\b|\bnode\.?js\b|\bjs\b/i.test(query)) return "javascript";
  if (/\bpython\b|\bpy\b/i.test(query)) return "python";
  if (/\bjava\b(?!script)/i.test(query)) return "java";
  // `\bc#\b` never matches when "c#" ends a sentence ("Show C#.") because `#`
  // and the following punctuation are both non-word characters, so there is
  // no `\w`/`\W` transition for the trailing `\b` to anchor on.
  if (/\bc#(?=[^a-zA-Z0-9]|$)|\bcsharp\b/i.test(query)) return "csharp";
  if (/\bcql\b/i.test(query)) return "cql";
  if (/\bjson\b|\bpayload\b|\brequest\s+body\b/i.test(query)) return "json";
  return undefined;
}

export function explicitSnippetRequest(query: string): boolean {
  return SNIPPET_REQUEST.test(query) || ONLY_CODE.test(query);
}

export function classifyResponseStyle(query: string): ResponseStyleDecision {
  const q = query.trim();
  const wantsSnippet = explicitSnippetRequest(q);
  const onlyCode = ONLY_CODE.test(q);
  const wantsBrief = BREVITY.test(q);
  const wantsDetail = DETAIL.test(q);
  const language = detectSnippetLanguage(q);

  if (wantsSnippet) {
    return {
      mode: "snippet",
      requestedDetail: onlyCode ? "minimal" : wantsDetail ? "detailed" : "normal",
      snippet: { requested: true, required: true, language },
      preferredStructure: "code_first",
      maxSections: onlyCode ? 1 : 2,
      includeCode: true,
      showTechnicalDetails: wantsDetail,
      reasonCode: onlyCode ? "only_code_request" : "explicit_snippet_request",
    };
  }

  if (TROUBLESHOOT.test(q) && !wantsDetail) {
    return {
      mode: "troubleshooting",
      requestedDetail: wantsBrief ? "minimal" : "normal",
      snippet: { requested: false, required: false },
      preferredStructure: "bullets",
      maxSections: 2,
      includeCode: false,
      showTechnicalDetails: false,
      reasonCode: "troubleshooting_compact",
    };
  }

  if (COMPARISON.test(q)) {
    return {
      mode: "comparison",
      requestedDetail: wantsDetail ? "detailed" : "normal",
      snippet: { requested: false, required: false },
      preferredStructure: "table",
      maxSections: wantsDetail ? 4 : 3,
      includeCode: false,
      showTechnicalDetails: wantsDetail,
      reasonCode: "comparison",
    };
  }

  if (ENDPOINT_ONLY.test(q) || (wantsBrief && /\bendpoint\b|\bpath\b/i.test(q))) {
    return {
      mode: "quick",
      requestedDetail: "minimal",
      snippet: { requested: false, required: false },
      preferredStructure: "direct",
      maxSections: 1,
      includeCode: false,
      showTechnicalDetails: false,
      reasonCode: "endpoint_only",
    };
  }

  if (CONCEPTUAL.test(q) && !wantsDetail) {
    return {
      mode: "conceptual",
      requestedDetail: wantsBrief ? "minimal" : "normal",
      snippet: { requested: false, required: false },
      preferredStructure: "direct",
      maxSections: 2,
      includeCode: false,
      showTechnicalDetails: false,
      reasonCode: "conceptual",
    };
  }

  if (wantsDetail) {
    return {
      mode: "detailed",
      requestedDetail: "detailed",
      snippet: { requested: false, required: false },
      preferredStructure: "steps",
      maxSections: 5,
      includeCode: false,
      showTechnicalDetails: true,
      reasonCode: "explicit_detail_request",
    };
  }

  if (wantsBrief) {
    return {
      mode: "quick",
      requestedDetail: "minimal",
      snippet: { requested: false, required: false },
      preferredStructure: "direct",
      maxSections: 1,
      includeCode: false,
      showTechnicalDetails: false,
      reasonCode: "brevity_request",
    };
  }

  return {
    mode: "standard",
    requestedDetail: "normal",
    snippet: { requested: false, required: false },
    preferredStructure: "bullets",
    maxSections: 3,
    includeCode: false,
    showTechnicalDetails: false,
    reasonCode: "default_standard",
  };
}

/** Map style language hint to agent codegen language. */
export function styleLanguageToAgentLanguage(
  language: SnippetLanguage | undefined
): "python" | "javascript" | "curl" | "java" | "go" {
  switch (language) {
    case "curl":
      return "curl";
    case "javascript":
    case "typescript":
      return "javascript";
    case "java":
      return "java";
    case "python":
    case "cql":
    case "json":
    case "csharp":
    case "other":
    default:
      return "python";
  }
}

/**
 * Constrained readability polish: shorten walls of text without inventing facts.
 * Strips repeated fenced code when structured steps/scripts will show code.
 */
export function polishWorkflowProse(
  workflow: string,
  style: ResponseStyleDecision,
  opts?: { stripCodeFences?: boolean }
): string {
  let text = workflow.trim();
  if (!text) return text;

  if (opts?.stripCodeFences || (!style.includeCode && style.mode !== "snippet")) {
    text = text.replace(/```[\s\S]*?```/g, "").trim();
  }

  // Drop giant A–G style chapter titles into lighter prose cues.
  text = text
    .replace(/^#{1,3}\s+/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+\n/g, "\n");

  if (style.mode === "troubleshooting" || style.mode === "quick" || style.mode === "conceptual") {
    const paragraphs = text.split(/\n\n+/).filter(Boolean);
    if (paragraphs.length > style.maxSections + 1) {
      text = paragraphs.slice(0, style.maxSections + 1).join("\n\n");
    }
    // Soft word budget for compact modes.
    const words = text.split(/\s+/);
    const limit =
      style.mode === "quick" ? 180 : style.mode === "conceptual" ? 220 : 320;
    if (words.length > limit) {
      text = `${words.slice(0, limit).join(" ")}…`;
    }
  }

  if (style.mode === "snippet" && style.requestedDetail === "minimal") {
    const first = text.split(/\n\n+/)[0] ?? text;
    text = first.length > 280 ? `${first.slice(0, 280)}…` : first;
  }

  return text.trim();
}

export function shouldAttachWorkflowScripts(style: ResponseStyleDecision): boolean {
  return style.includeCode && style.snippet.requested;
}

export function shouldUseEssayTemplates(
  style: ResponseStyleDecision,
  isNonTech: boolean,
  query?: string
): boolean {
  if (style.snippet.required) return false;
  if (isNonTech && (style.mode === "detailed" || style.mode === "conceptual")) {
    return true;
  }
  if (query && HANDOFF.test(query) && style.mode !== "quick" && style.mode !== "snippet") {
    return true;
  }
  return false;
}

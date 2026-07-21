import type { AgentCitation, AgentPlan, AgentPlanStep, ScoredChunk } from "./types";
import { parseDateRangeFromQuery } from "./date-range";
import { shouldUseCtixListIndicatorsTemplate } from "./non-technical";
import {
  apiBaseUrlHint,
  getProductOrThrow,
  listProducts,
} from "../products/registry";
import { extractTagNameFromQuery } from "../workflow-step-context";
import { canonicalizeIntent } from "./normalize-query";

const LIST_TAGS_SLUG = "tags/list-tags";
const CREATE_TAG_SLUG = "tags/create-tag";

/** Endpoints that are NOT list/create single tag (common LLM mistakes). */
const TAG_MGMT_WRONG_SLUG =
  /tag-groups\/|bulk-action|administration\/tag-management\/create-tags|ingestion\/tags\/bulk-actions/i;

const WORKFLOW_PATTERNS: { keywords: string[]; slugs: string[]; intro: string }[] = [
  {
    keywords: ["import", "stix", "upload", "intel", "indicator", "bundle"],
    slugs: [
      "import-intel/source-collections",
      "import-intel/import-intel",
      "threat-data/list-threat-data",
    ],
    intro:
      "To import STIX intel and verify it landed in CTIX, fetch a valid import collection ID first, upload the bundle, then query threat data.",
  },
  {
    keywords: ["threat", "list", "search", "indicator", "ioc"],
    slugs: ["threat-data/list-threat-data"],
    intro: "Use the Threat Data List endpoint to search and paginate indicators in your tenant.",
  },
  {
    keywords: ["ping", "health", "connect", "test connection"],
    slugs: ["ping/ping"],
    intro: "Start with the Ping endpoint to confirm API connectivity and credentials.",
  },
  {
    keywords: ["tag", "add", "attach", "assign", "indicator", "bulk"],
    slugs: [
      "threat-data/list-threat-data",
      "tags/list-tags",
      "tags/create-tag",
      "threat-data/bulk-actions/bulk-add-remove-tags/bulk-add-remove-tags",
    ],
    intro:
      "Search indicators in threat data, find or create the tag, then bulk-add it to those indicators. Run steps in order — ids chain automatically.",
  },
];

const APP_PATTERNS: {
  keywords: string[];
  slugs: string[];
  intro: string;
  title: string;
}[] = [
  {
    keywords: ["phishing", "email", "ioc", "indicator", "analyze", "extract", "tag", "tlp"],
    slugs: [
      "quick-add-intel/create-parse-iocs-task",
      "quick-add-intel/retrieve-parsed-iocs",
      "threat-data/list-threat-data",
      "tags/list-tags",
      "quick-add-intel/quick-add-intel",
    ],
    intro:
      "Parse IOCs from email text, look them up in threat data, manage tags, and create intel via Quick Add.",
    title: "Phishing Email Analyzer",
  },
  {
    keywords: ["import", "stix", "upload", "bundle"],
    slugs: [
      "import-intel/source-collections",
      "import-intel/import-intel",
      "threat-data/list-threat-data",
    ],
    intro: "Import STIX bundles and verify indicators in threat data.",
    title: "STIX Import Portal",
  },
];

function citationFromChunk(chunk: ScoredChunk): AgentCitation {
  const productId = chunk.productId ?? "ctix";
  return {
    slug: chunk.slug,
    title: chunk.title,
    url: docsUrlForProduct(productId, chunk.slug),
  };
}

function endpointChunks(chunks: ScoredChunk[]): ScoredChunk[] {
  return chunks.filter((c) => c.kind === "endpoint");
}

function matchWorkflowPattern(query: string): typeof WORKFLOW_PATTERNS[0] | null {
  const q = query.toLowerCase();
  let best: (typeof WORKFLOW_PATTERNS)[0] | null = null;
  let bestHits = 0;
  for (const pattern of WORKFLOW_PATTERNS) {
    const hits = pattern.keywords.filter((k) => q.includes(k)).length;
    if (hits > bestHits) {
      bestHits = hits;
      best = pattern;
    }
  }
  return bestHits >= 2 ? best : null;
}

const TAG_LIST_INTENT =
  /\blist\b|\bget\b|\bretrieve\b|\bshow\b|\bconfirm\b|\bverify\b|\bcheck\b|\bexists?\b|\bfind\b|\bsearch\b|\bhave\b|\bgot\b|\btake its id\b/;
const TAG_CREATE_INTENT = /\bcreate\b|\bnew tag\b|\bmake\b/;

export function isTagListVerifyQuery(query: string): boolean {
  const q = query.toLowerCase();
  const tagIntent = /\btags?\b/.test(q);
  const createIntent = TAG_CREATE_INTENT.test(q);
  return tagIntent && TAG_LIST_INTENT.test(q) && !createIntent;
}

export function isTagCreateQuery(query: string): boolean {
  const q = query.toLowerCase();
  const tagIntent = /\btags?\b/.test(q);
  return tagIntent && TAG_CREATE_INTENT.test(q) && !isTagCreateVerifyQuery(query);
}

export function isTagCreateVerifyQuery(query: string): boolean {
  const q = query.toLowerCase();
  const tagIntent = /\btags?\b/.test(q);
  const verifyIntent =
    /\blist\b|\bverify\b|\bconfirm\b|\bcheck\b|\bexists?\b|\bshow\b/.test(q);
  return tagIntent && TAG_CREATE_INTENT.test(q) && verifyIntent;
}

/** Plain "show me the indicators / threat data" (no tag, no create). */
export function isListIndicatorsQuery(query: string): boolean {
  const q = query.toLowerCase();
  const target = /\bindicators?\b|threat\s*data/.test(q);
  const list = /\blist\b|\bshow\b|\bget\b|\bsee\b|\bview\b|\bsearch\b|\bfind\b|\bdisplay\b/.test(q);
  const tag = /\btags?\b/.test(q);
  const create = /\bcreate\b|\badd\b|\bimport\b|\bmake\b/.test(q);
  return target && list && !tag && !create;
}

function planStepsForSlugs(
  slugs: string[],
  chunks: ScoredChunk[],
  intro: string
): { steps: AgentPlanStep[]; citations: AgentCitation[] } {
  const steps = stepsFromSlugs(slugs, chunks, intro);
  const citations = steps.map((s) => {
    const chunk = chunks.find((c) => c.slug === s.slug);
    return chunk
      ? citationFromChunk(chunk)
      : { slug: s.slug, title: s.slug, url: `/docs/${s.slug}` };
  });
  return { steps, citations };
}

export function isTagToIndicatorQuery(query: string): boolean {
  const q = query.toLowerCase();
  const hasTag = /\btags?\b/.test(q);
  const hasTarget = /\bindicators?\b|\biocs?\b|threat\s*data/.test(q);
  const hasAction = /\badd\b|\battach\b|\bassign\b|\bbulk\b|\bput\b|\bplace\b|\bapply\b/.test(q);
  return hasTag && hasTarget && hasAction;
}

/** List / verify / create tag — never tag-group bulk actions. */
export function enforceTagManagementPlan(
  plan: AgentPlan,
  query: string,
  chunks: ScoredChunk[]
): AgentPlan {
  const tagName = extractTagNameFromQuery(query);

  if (isTagListVerifyQuery(query)) {
    const intro = tagName
      ? `Search for tag **${tagName}** (GET \`ingestion/tags/?q=${tagName}&tag_type=user\`). ` +
        `After Run, the response summary shows whether it already exists and its **id** — no manual scan of the full list.`
      : "List all tags with page_size 100 using **Get Tags List** (`tags/list-tags`).";
    const { steps, citations } = planStepsForSlugs([LIST_TAGS_SLUG], chunks, intro);
    return {
      ...plan,
      confidence: Math.max(plan.confidence, 0.85),
      workflow: intro,
      steps,
      citations,
    };
  }

  if (isTagCreateVerifyQuery(query)) {
    const intro = tagName
      ? `Find-or-create **${tagName}**: (1) search with \`q=${tagName}\` — if found, use that id; ` +
        `(2) else **Create Tag**; (3) search again to confirm \`id\`, \`name\`, \`is_active\`.`
      : `Create the tag with **Create Tag**, then search **Get Tags List** to verify id, name, and is_active.`;
    const { steps, citations } = planStepsForSlugs(
      tagName ? [LIST_TAGS_SLUG, CREATE_TAG_SLUG, LIST_TAGS_SLUG] : [CREATE_TAG_SLUG, LIST_TAGS_SLUG],
      chunks,
      intro
    );
    return { ...plan, confidence: Math.max(plan.confidence, 0.85), workflow: intro, steps, citations };
  }

  if (isTagCreateQuery(query) && tagName) {
    const intro =
      `Find-or-create **${tagName}**: search first (\`q=${tagName}\`, \`tag_type=user\`). ` +
      `If the summary says the tag already exists, use that **id** and skip Create. Otherwise run **Create Tag**.`;
    const { steps, citations } = planStepsForSlugs([LIST_TAGS_SLUG, CREATE_TAG_SLUG], chunks, intro);
    return { ...plan, confidence: Math.max(plan.confidence, 0.85), workflow: intro, steps, citations };
  }

  // Drop tag-group mistakes when query is tag-only (no indicator bulk-add)
  if (/\btags?\b/.test(query.toLowerCase()) && !isTagToIndicatorQuery(query)) {
    const filtered = plan.steps.filter((s) => !TAG_MGMT_WRONG_SLUG.test(s.slug));
    if (filtered.length !== plan.steps.length) {
      return {
        ...plan,
        steps: filtered.map((s, i) => ({ ...s, order: i + 1 })),
        workflow:
          plan.workflow +
          "\n\n**Note:** Use **Get Tags List** (`tags/list-tags`) to list/verify tags — not Tag Group or `ingestion/tags/bulk-actions/`.",
      };
    }
  }

  return plan;
}

const PING_SLUG = "ping/ping";

const CONNECTIVITY_BY_PRODUCT: Record<
  string,
  { slug: string; title: string; intro: string }
> = {
  ctix: {
    slug: PING_SLUG,
    title: "Ping",
    intro:
      "Check connectivity with **Ping** (`GET ping/`). A 200 response means the API and your credentials are working.",
  },
  cftr: {
    slug: "cftr-api-reference/authentication/test-connectivity",
    title: "Test connectivity",
    intro:
      "Verify CFTR credentials with **Test connectivity** (`GET /cftrapi/openapi/test-connectivity/`). " +
      "A 200 response confirms the API connection and Open API auth are working.",
  },
  orchestrate: {
    slug: "authentication/test-connectivity",
    title: "Test connectivity",
    intro:
      "Verify your Orchestrate credentials with **Test connectivity** (`GET authentication/test-connectivity`). " +
      "A 200 response confirms the API connection and Open API auth are working.",
  },
  csap: {
    slug: "analyst-portal/authentication/test-connectivity",
    title: "Test connectivity",
    intro:
      "Verify your CSAP credentials with **Test connectivity** (`GET analyst-portal/authentication/test-connectivity`). " +
      "A 200 response confirms the API connection and Open API auth are working.",
  },
};

function docsUrlForProduct(productId: string, slug: string): string {
  return productId === "ctix" ? `/docs/${slug}` : `/docs/${productId}/${slug}`;
}

const REPORT_TOKEN_SLUG = "reports/token-to-download-file";
const REPORT_DOWNLOAD_SLUG = "reports/download-file";

/** "download a report file" → Reports external download (not email inbox attachments). */
export function isReportDownloadQuery(query: string): boolean {
  const q = query.toLowerCase();
  if (/\b(email|inbox|mailbox|attachment|threat\s*mail|message)\b/.test(q)) return false;
  const wantsReport = /\breports?\b/.test(q);
  const wantsFile = /\b(file|files)\b/.test(q);
  const wantsDownload =
    /\b(download|get|fetch|retrieve)\b/.test(q) ||
    /\b(link|token|file_id)\b/.test(q);
  return wantsReport && wantsFile && wantsDownload;
}

export function enforceReportDownloadPlan(
  plan: AgentPlan,
  query: string,
  chunks: ScoredChunk[]
): AgentPlan {
  if (!isReportDownloadQuery(query)) return plan;
  const intro =
    "Download a CTIX report or external intel file: first get an authorization token with " +
    "**Get Token to Download File** (`GET ingestion/file/{file_id}/`), then download with " +
    "**Get Download File** (`GET ingestion/external_download/{file_id}/?token=...`) using the file_id and token. " +
    "This is **not** threat mailbox email attachment download.";
  const { steps, citations } = planStepsForSlugs(
    [REPORT_TOKEN_SLUG, REPORT_DOWNLOAD_SLUG],
    chunks,
    intro
  );
  if (steps.length === 0) return plan;
  return {
    ...plan,
    confidence: Math.max(plan.confidence, 0.9),
    workflow: intro,
    steps,
    citations,
    questions: undefined,
  };
}

/** "what is the base URL / tenant URL / where do I call the API". */
export function isBaseUrlQuery(query: string): boolean {
  const q = query.toLowerCase();
  return (
    /\b(base\s*url|api\s*url|open\s*api\s*url|tenant\s*url|root\s*url)\b/.test(q) ||
    /\bwhat\s+(is\s+)?(the\s+)?(live\s+)?(open\s+)?api\b.*\burl\b/.test(q) ||
    /\bwhere\s+(do\s+i\s+)?(call|send|point|hit)\b.*\bapi\b/.test(q) ||
    /\b(all|each|every)\b.*\b(base\s*url|apis?)\b/.test(q) ||
    /\b(base\s*url|apis?).*\b(all|each|every|four|4)\b/.test(q)
  );
}

/** "do I need separate keys / credentials per product". */
export function isCredentialsQuery(query: string): boolean {
  const q = query.toLowerCase();
  return (
    /\b(separate|different|own|distinct)\b.*\b(key|credential|access\s*id|secret)/.test(q) ||
    /\bhow many\b.*\b(key|credential|access\s*id)/.test(q) ||
    /\b(same|share[ds]?)\b.*\b(key|credential|access\s*id).*\b(ctix|cftr|csap|orchestrate|product)/.test(q) ||
    /\b(access\s*id|secret\s*key).*\b(each|all|every|four|4)\b.*\b(api|product)/.test(q) ||
    /\buse\b.*\bmy\b.*\b(ctix|cftr|csap|orchestrate)\b.*\b(access|credential|key|secret)/.test(q) ||
    /\b(ctix|cftr|csap|orchestrate)\b.*\b(access\s*id|secret\s*key|credential)/.test(q) ||
    /\b(need|require)\b[\s\S]{0,40}\b(separate|different|own|distinct)\b[\s\S]{0,60}\b(access\s*id|secret\s*key|credential|key)\b/.test(
      q
    ) ||
    /\b(access\s*id|secret\s*key)\b[\s\S]{0,40}\b(each|every|per)\b[\s\S]{0,20}\b(product|api)\b/.test(q)
  );
}

export function isSetupInfoQuery(query: string): boolean {
  return isBaseUrlQuery(query) || isCredentialsQuery(query);
}

/**
 * How-to Open API auth (AccessID / Signature / Expires) — not an endpoint lookup.
 * Without this, LLMs invent a fake `authentication` slug and the validator abstains.
 */
export function isOpenApiAuthHowToQuery(query: string): boolean {
  const q = query.toLowerCase();
  if (isSetupInfoQuery(query) || isCatalogQuery(query) || isRateLimitQuery(query) || isHttpStatusMeaningQuery(query)) {
    return false;
  }
  const howTo =
    /\bhow\s+(do\s+i|does|to)\b[\s\S]{0,80}\bauthenticat/.test(q) ||
    /\bauthenticat(?:e|ion|ing)\b[\s\S]{0,80}\b(open\s*api|api\s+request|request|ctix|cftr|csap|orchestrate)\b/.test(
      q
    ) ||
    /\b(open\s*api|api)\s+authenticat/.test(q) ||
    /\bhow\s+does\b[\s\S]{0,40}\b(open\s*api\s+)?authentication\s+work\b/.test(q) ||
    /\b(required|need(?:ed)?)\b[\s\S]{0,60}\b(query\s*)?(param(?:eter)?s?)\b[\s\S]{0,40}\b(access\s*id|signature|expires|auth)/.test(
      q
    ) ||
    /\b(access\s*id|signature|expires)\b[\s\S]{0,40}\b(query|param|hmac|sign|authenticat)/.test(q) ||
    /\bhmac[- ]?sha-?1\b/.test(q);
  if (!howTo) return false;
  // isPingQuery also matches phrases like "api … work"; keep those as auth how-to
  // when authentication / HMAC / query-auth params are explicit.
  if (
    isPingQuery(query) &&
    !/\bauthenticat/.test(q) &&
    !/\b(access\s*id|signature|expires|hmac)\b/.test(q)
  ) {
    return false;
  }
  return true;
}

function openApiAuthWorkflow(productId: string): string {
  const label =
    productId === "all" ? "Cyware Open API" : getProductOrThrow(productId).displayLabel;
  return (
    `**${label} Open API authentication** uses three query parameters on every request:\n\n` +
    `1. **AccessID** — your Open API access ID\n` +
    `2. **Expires** — Unix expiry timestamp (short-lived; typically tens of seconds)\n` +
    `3. **Signature** — HMAC-SHA1 of \`{AccessID}\\n{Expires}\`, keyed with your **Secret Key**, then Base64-encoded (URL-safe as needed)\n\n` +
    `Never put the Secret Key in the URL or in chat answers as a concrete value — only AccessID, Signature, and Expires belong on the request. ` +
    `Generate Signature & Expires in **API Settings** (or your Integrators / pre-request tooling), connect products at **/authentication**, ` +
    `then verify with the product connectivity check.`
  );
}

/** Answer Open API auth how-to from product rules (not a hallucinated auth endpoint). */
export function enforceOpenApiAuthPlan(
  plan: AgentPlan,
  query: string,
  productId: string
): AgentPlan {
  if (!isOpenApiAuthHowToQuery(query)) return plan;

  const workflow = openApiAuthWorkflow(productId);
  const steps: AgentPlanStep[] = [];
  const citations: AgentCitation[] = [];

  if (productId === "ctix") {
    citations.push({
      slug: "authentication",
      title: "Authentication",
      url: docsUrlForProduct("ctix", "authentication"),
    });
  }

  const targets =
    productId === "all"
      ? listProducts().map((p) => p.productId)
      : [productId];

  for (const id of targets) {
    const cfg = CONNECTIVITY_BY_PRODUCT[id];
    if (!cfg) continue;
    // Single-product: attach connectivity as a verification step. All-products:
    // citations only (steps must resolve in one product content tree).
    if (productId !== "all") {
      steps.push({
        slug: cfg.slug,
        order: 1,
        explanation:
          `After auth params are set, verify with **${cfg.title}**. ${cfg.intro}`,
      });
    }
    citations.push({
      slug: cfg.slug,
      title: productId === "all" ? `${getProductOrThrow(id).displayLabel}: ${cfg.title}` : cfg.title,
      url: docsUrlForProduct(id, cfg.slug),
    });
  }

  return {
    ...plan,
    confidence: 0.95,
    workflow,
    steps,
    citations: citations.length > 0 ? citations : plan.citations,
    questions: undefined,
  };
}

/** HTTP status meaning questions (401/403/404/…) — not an endpoint lookup. */
export function isHttpStatusMeaningQuery(query: string): boolean {
  const q = query.toLowerCase();
  if (isRateLimitQuery(query)) return false;
  return (
    /\bwhat\s+does\b[\s\S]{0,40}\b(401|403|404|400|409|422|500|502|503)\b/.test(q) ||
    /\b(mean|meaning|means)\b[\s\S]{0,30}\b(401|403|404|400|409|422|500)\b/.test(q) ||
    /\b(401|403|404)\b[\s\S]{0,40}\b(mean|error|response|status)\b/.test(q) ||
    /\bwhy\b[\s\S]{0,40}\b(401|403|404)\b/.test(q)
  );
}

export function enforceHttpStatusGuidancePlan(plan: AgentPlan, query: string): AgentPlan {
  if (!isHttpStatusMeaningQuery(query)) return plan;
  const q = query.toLowerCase();
  const code = (q.match(/\b(401|403|404|400|409|422|500|502|503)\b/) || [])[1] || "4xx";
  const guidance: Record<string, string> = {
    "401":
      "HTTP **401 Unauthorized** on an Open API call usually means the request auth is missing, expired, or invalid. " +
      "Confirm **AccessID**, **Signature**, and **Expires** are present on the query string, regenerate Signature & Expires " +
      "(Expires is short-lived), and verify you are using that product’s own Access ID + Secret Key — never put the Secret Key in the URL.",
    "403":
      "HTTP **403 Forbidden** means the credentials were accepted enough to identify the caller, but the Open API role/permissions " +
      "do not allow this action. Check the Integrator / Open API role grants for the endpoint, not just the signature.",
    "404":
      "HTTP **404 Not Found** means the path or object ID is wrong for this tenant/version, or the resource was removed. " +
      "Confirm the documented path for this product (including product prefixes) and that any `{id}` path params exist.",
    "400":
      "HTTP **400 Bad Request** means the server rejected the payload or query parameters. Compare required fields and types " +
      "against the endpoint docs; fix validation errors before retrying.",
    "409":
      "HTTP **409 Conflict** usually means a create/update collided with an existing resource (duplicate name/ID). " +
      "Search first, then create or update the existing object.",
    "422":
      "HTTP **422 Unprocessable Entity** means the request was understood but failed semantic validation. " +
      "Inspect the response body for field-level errors and align with the documented schema.",
    "500":
      "HTTP **500** is a server-side error. Retry with backoff; if it persists, capture the response body and request ID for support — do not invent alternate undocumented paths.",
    "502":
      "HTTP **502 Bad Gateway** is usually transient upstream failure. Retry with backoff; do not invent alternate endpoints.",
    "503":
      "HTTP **503 Service Unavailable** means the API is temporarily overloaded or down. Retry with backoff and honour Retry-After when present.",
  };
  const workflow =
    guidance[code] ||
    `HTTP **${code}** should be handled from the documented status meaning and response body — do not invent undocumented endpoints to work around it.`;

  return {
    ...plan,
    confidence: Math.max(plan.confidence, 0.9),
    workflow,
    steps: [],
    citations: [],
    questions: undefined,
  };
}

/** HTTP 429 / rate-limit client guidance — not an endpoint lookup. */
export function isRateLimitQuery(query: string): boolean {
  const q = query.toLowerCase();
  return (
    /\b429\b/.test(q) ||
    /\brate[- ]?limit(?:ed|ing|s)?\b/.test(q) ||
    /\btoo many requests\b/.test(q) ||
    (/\bretry[- ]?after\b/.test(q) && /\b(header|response|429|limit)\b/.test(q))
  );
}

/**
 * Prefer client-side retry guidance over an unrelated retrieved endpoint
 * (e.g. "Get Actions List" matching on "handle … responses").
 */
export function enforceRateLimitGuidancePlan(plan: AgentPlan, query: string): AgentPlan {
  if (!isRateLimitQuery(query)) return plan;

  const workflow =
    "HTTP **429 Too Many Requests** means the Open API rate limit was hit. " +
    "There is no dedicated “handle 429” documentation endpoint — handle it in your client:\n\n" +
    "1. **Back off and retry** with exponential delay (e.g. 1s → 2s → 4s), capped around 30–60s.\n" +
    "2. Honour **`Retry-After`** when the response includes it (seconds or HTTP-date).\n" +
    "3. **Reduce request rate** — smaller page sizes, less aggressive polling, and batching where the API allows.\n" +
    "4. Treat 429 as **transient**; do not invent alternate paths. Generated workflow scripts already retry 429/5xx with backoff.\n\n" +
    "If 429s persist after backing off, check concurrent integrations sharing the same Open API key.";

  return {
    ...plan,
    confidence: Math.max(plan.confidence, 0.9),
    workflow,
    steps: [],
    citations: [],
    questions: undefined,
  };
}

/** "What products/APIs are documented here?" */
export function isCatalogQuery(query: string): boolean {
  const q = query.toLowerCase();
  return (
    /\bwhat (cyware )?(products|apis)\b/.test(q) ||
    /\bwhich (products|apis)\b.*\b(documented|available|here)\b/.test(q) ||
    /\b(documented|available)\b.*\b(here|on this site)\b/.test(q) ||
    /\bwhat('s| is) (documented|available)\b/.test(q)
  );
}

/** Answer product catalog questions from the registry (not doc RAG). */
export function enforceCatalogPlan(
  plan: AgentPlan,
  query: string,
  allowedProductIds?: readonly string[]
): AgentPlan {
  if (!isCatalogQuery(query)) return plan;

  const products =
    allowedProductIds && allowedProductIds.length > 0
      ? listProducts().filter((product) => allowedProductIds.includes(product.productId))
      : listProducts();

  const workflow =
    "**Documented Cyware APIs you can use in the agent:**\n\n" +
    products
      .map(
        (p) =>
          `- **${p.displayLabel}** — ${p.description} (` +
          `\`/docs/${p.productId === "ctix" ? "intel-exchange-api-reference" : p.productId}/…\`)`
      )
      .join("\n") +
    "\n\nEach product uses its **own** Access ID + Secret Key. Connect products at **/authentication** " +
    "before asking the agent about them.";

  return {
    workflow,
    confidence: 0.95,
    steps: [],
    citations: products.map((p) => ({
      slug: p.productId,
      title: p.displayLabel,
      url: p.productId === "ctix" ? "/docs/intel-exchange-api-reference" : `/docs/${p.productId}`,
    })),
    questions: undefined,
  };
}

const TAGS_LIST_PATTERN =
  /\b(tags?|labels?)\b.*\b(list|get|show|all|fetch|view|retrieve)\b|\b(list|get|show|all|fetch|view|retrieve)\b.*\b(tags?|labels?)\b/i;
const MEMBERS_PATTERN = /\b(members?|users?)\b/i;
const APPS_INTEGRATIONS_PATTERN = /\b(apps?|integrations?)\b/i;
const PLAYBOOKS_PATTERN = /\bplaybooks?\b/i;
const EXECUTION_STATUS_PATTERN =
  /\b(execution|run)\b[\s\S]{0,40}\b(status|state|log|progress)\b|\bcheck\b[\s\S]{0,40}\b(execution|run)\b/i;
const CANCEL_EXECUTION_PATTERN =
  /\b(cancel|terminate|stop|kill|abort)\b[\s\S]{0,40}\b(execution|run|playbook)\b/i;
const INCIDENTS_LIST_PATTERN =
  /\bincidents?\b.*\b(list|get|show|all|fetch|view|retrieve)\b|\b(list|get|show|all|fetch|view|retrieve)\b.*\bincidents?\b/i;
const ALERTS_PATTERN = /\b(analyst portal )?(alert|alerts)\b/i;
const INTEL_CATEGORIES_PATTERN = /\b(intel\s*)?(categories?|category)\b/i;
const VERSION_PATTERN = /\b(product\s*)?(release\s*)?version\b/i;

// Guards against the too-broad "any mention of the noun" catch-alls below:
// a query about bulk/update/troubleshooting/existence must not be silently
// force-answered with an unrelated "list X" endpoint.
const NOT_A_LIST_QUESTION =
  /\b(?:bulk|update|updating|updated|delete|deleting|deleted|create|creating|created|comment|attachment|patch)\b|\b(?:400|401|403|404|409|422|429|500|502|503)\b|\bwhy\b|\berror\b|\bfail(?:ed|ing)?\b|\bbroken\b|\bnot\s+work(?:ing)?\b|\bis\s+there\b|\bdoes\b.*\bsupport\b|\bcan\s+i\b/i;

const PRODUCT_DOC_INTENTS: Record<
  string,
  { pattern: RegExp; exclude?: RegExp; slug: string; title: string; intro: string }[]
> = {
  cftr: [
    {
      pattern: INCIDENTS_LIST_PATTERN,
      slug: "cftr-api-reference/incidents/get-list-of-incidents",
      title: "Get List of Incidents",
      intro:
        "List CFTR incidents with **Get List of Incidents** (`GET /v1/incident/` → `/cftrapi/openapi/v1/incident/` on cftrapi.cyware.com).",
    },
    {
      // Last-resort disambiguation for a bare "the incident endpoint" mention
      // that didn't match the list-verb pattern above (e.g. "only give me the
      // CFTR incident endpoint"). Guarded so it never overrides bulk/update/
      // troubleshooting/existence questions with the wrong endpoint — those
      // must fall through to retrieval instead of a confident wrong answer.
      pattern: /\bincidents?\b/i,
      exclude: NOT_A_LIST_QUESTION,
      slug: "cftr-api-reference/incidents/get-list-of-incidents",
      title: "Get List of Incidents",
      intro:
        "List CFTR incidents with **Get List of Incidents** (`GET /v1/incident/` → `/cftrapi/openapi/v1/incident/` on cftrapi.cyware.com).",
    },
  ],
  csap: [
    {
      pattern: ALERTS_PATTERN,
      slug: "analyst-portal/analyst-portal-alerts/alerts-list-analyst-member",
      title: "Get Alerts",
      intro:
        "List analyst portal alerts with **Get Alerts (Analyst Portal)** (`GET csap/v1/list_alert/`).",
    },
    {
      pattern: MEMBERS_PATTERN,
      slug: "analyst-portal/member/member-list-analyst",
      title: "Get Member List",
      intro:
        "List CSAP analyst portal members with **Get Member List** (`GET csap/v1/member/`).",
    },
    {
      pattern: INTEL_CATEGORIES_PATTERN,
      slug: "analyst-portal/intel/intel-categories-list-analyst-member",
      title: "Get Intel Categories List",
      intro:
        "List intel categories with **Get Intel Categories List** (`GET csap/v1/intel_category/`).",
    },
  ],
  orchestrate: [
    {
      pattern: TAGS_LIST_PATTERN,
      slug: "tags/get-list-of-tags",
      title: "Get List of Tags",
      intro:
        "List Orchestrate tags with **Get List of Tags** (`GET v1/tags/`). Use pagination params to page through results.",
    },
    {
      pattern: VERSION_PATTERN,
      slug: "authentication/product-release-version",
      title: "Product Release Version",
      intro:
        "Returns the Orchestrate application version via **Product Release Version** (`GET v1/release_version/`).",
    },
    {
      pattern: APPS_INTEGRATIONS_PATTERN,
      slug: "integrations/get-apps",
      title: "Get Apps",
      intro:
        "List installed Orchestrate apps and integrations with **Get Apps** (`GET v1/apps/`).",
    },
    // Execution status/cancel must be checked before the bare playbook
    // catch-all below, or "check my playbook execution status" would be
    // misrouted to "list all playbooks".
    {
      pattern: EXECUTION_STATUS_PATTERN,
      slug: "playbook/get-playbook-detail-run-log",
      title: "Get Playbook Run Log Details",
      intro:
        "Check a playbook execution's status with **Get Playbook Run Log Details** " +
        "(`GET v1/playbook/playbook-result/{playbook_result_unique_id}/`), using the " +
        "`playbook_result_unique_id` returned when you started the run.",
    },
    {
      pattern: CANCEL_EXECUTION_PATTERN,
      slug: "playbook/bulk-terminate-api-view",
      title: "Bulk Terminate Playbook Runs",
      intro:
        "Cancel a playbook execution with **Bulk Terminate Playbook Runs** " +
        "(`POST v1/playbook/playbook-result/bulk-terminate/`), passing its " +
        "`playbook_result_unique_id` in `playbook_result_unique_ids` (max 100 per call, " +
        "and only runs that are in progress, in-queue, waiting, or on hold can be terminated).",
    },
    {
      pattern: PLAYBOOKS_PATTERN,
      slug: "playbook/get-playbook",
      title: "Get Playbook Details",
      intro:
        "List all playbooks with **Get Playbook Details** (`GET v1/playbook/filter/`). Omit the playbook ID to return the full list.",
    },
  ],
};

/** Route common per-product doc questions to canonical endpoints when retrieval is weak. */
export function enforceProductDocPlan(
  plan: AgentPlan,
  query: string,
  chunks: ScoredChunk[],
  productId: string
): AgentPlan {
  if (productId === "all" || isPingQuery(query) || isSetupInfoQuery(query) || isCatalogQuery(query)) {
    return plan;
  }

  const intents = PRODUCT_DOC_INTENTS[productId];
  if (!intents) return plan;

  const intentQuery = canonicalizeIntent(query);

  for (const intent of intents) {
    if (!intent.pattern.test(intentQuery) && !intent.pattern.test(query)) continue;
    if (intent.exclude && (intent.exclude.test(intentQuery) || intent.exclude.test(query))) continue;
    // Do not override stronger plans from CTIX-specific enforcers (tag mgmt, list indicators).
    if (plan.steps.length > 0 && (plan.confidence ?? 0) >= 0.9) return plan;
    const chunk = chunks.find((c) => c.slug === intent.slug);
    const step: AgentPlanStep = { slug: intent.slug, order: 1, explanation: intent.intro };
    return {
      ...plan,
      confidence: Math.max(plan.confidence, 0.92),
      workflow: intent.intro,
      steps: [step],
      citations: [
        {
          slug: intent.slug,
          title: chunk?.title ?? intent.title,
          url: docsUrlForProduct(productId, intent.slug),
        },
      ],
      questions: undefined,
    };
  }

  return plan;
}

function setupInfoWorkflow(productId: string): string {
  if (productId === "all") {
    const lines = listProducts().map((p) => {
      const hint = apiBaseUrlHint(p.productId);
      return `- **${p.displayLabel}** — \`${p.baseApiUrl}\` — ${hint}`;
    });
    return (
      "**Live Open API base URLs** (set in API Settings when you switch products):\n\n" +
      `${lines.join("\n")}\n\n` +
      "**Credentials:** each product has its **own** Access ID + Secret Key pair (generated in that product's admin). " +
      "CTIX keys do not work for CFTR, CSAP, or Orchestrate. If you use all four products, you need **four pairs** (eight values total)."
    );
  }

  const product = getProductOrThrow(productId);
  const hint = apiBaseUrlHint(productId);
  const credNote =
    productId === "ctix"
      ? "Generate Access ID + Secret Key in CTIX → API Settings / Integrators CSV."
      : `Generate Access ID + Secret Key in **${product.productName}** admin (not from CTIX).`;

  return (
    `**Live Open API base URL** for ${product.displayLabel}: \`${product.baseApiUrl}\`\n\n` +
    `${hint}\n\n` +
    `Enter this in **API Settings** (header). ${credNote} ` +
    `Each Cyware product uses its **own** separate Access ID + Secret Key pair — you cannot reuse CTIX credentials on other APIs.`
  );
}

/** Answer base URL / credentials setup questions from the product registry (not doc RAG). */
export function enforceSetupInfoPlan(
  plan: AgentPlan,
  query: string,
  productId: string
): AgentPlan {
  if (!isSetupInfoQuery(query)) return plan;

  const workflow = setupInfoWorkflow(productId);
  const authSlug =
    productId === "all"
      ? undefined
      : CONNECTIVITY_BY_PRODUCT[productId]?.slug;

  const steps: AgentPlanStep[] = [];
  const citations: AgentCitation[] = [];

  if (authSlug && productId !== "all") {
    const cfg = CONNECTIVITY_BY_PRODUCT[productId]!;
    steps.push({
      slug: authSlug,
      order: 1,
      explanation:
        `After setting base URL \`${getProductOrThrow(productId).baseApiUrl}\`, run **${cfg.title}** to verify credentials.`,
    });
    citations.push({
      slug: authSlug,
      title: cfg.title,
      url: docsUrlForProduct(productId, authSlug),
    });
  } else if (productId === "all") {
    for (const p of listProducts()) {
      const cfg = CONNECTIVITY_BY_PRODUCT[p.productId];
      if (!cfg) continue;
      citations.push({
        slug: cfg.slug,
        title: `${p.displayLabel}: ${cfg.title}`,
        url: docsUrlForProduct(p.productId, cfg.slug),
      });
    }
  }

  return {
    ...plan,
    confidence: 0.95,
    workflow,
    steps,
    citations: citations.length > 0 ? citations : plan.citations,
    questions: undefined,
  };
}

/** "is the connection working / test the api / ping" → Ping. */
export function isPingQuery(query: string): boolean {
  const q = query.toLowerCase();
  return (
    /\bping\b/.test(q) ||
    /\b(connection|connectivity|reachable|api)\b.*\b(work|working|up|live|ok|alive|test)\b/.test(q) ||
    /\b(test|check|verify)\b.*\b(connection|connectivity|api|reachab|credential|credentials|auth|keys?)\b/.test(q) ||
    /\b(credential|credentials|auth|keys?)\b.*\b(work|working|valid|test|check)\b/.test(q) ||
    /\bis (it|the api|the connection|everything) working\b/.test(q)
  );
}

/** Route "test connection / credentials working" prompts to the product connectivity endpoint. */
export function enforceConnectivityPlan(
  plan: AgentPlan,
  query: string,
  chunks: ScoredChunk[],
  productId: string
): AgentPlan {
  if (!isPingQuery(query)) return plan;
  const cfg = CONNECTIVITY_BY_PRODUCT[productId];
  if (!cfg) return plan;

  const chunk = chunks.find((c) => c.slug === cfg.slug);
  const step: AgentPlanStep = {
    slug: cfg.slug,
    order: 1,
    explanation: cfg.intro,
  };
  const citation: AgentCitation = chunk
    ? { slug: chunk.slug, title: chunk.title, url: docsUrlForProduct(productId, cfg.slug) }
    : { slug: cfg.slug, title: cfg.title, url: docsUrlForProduct(productId, cfg.slug) };

  return {
    ...plan,
    confidence: Math.max(plan.confidence, 0.9),
    workflow: cfg.intro,
    steps: [step],
    citations: [citation],
    questions: undefined,
  };
}

export function enforcePingPlan(
  plan: AgentPlan,
  query: string,
  chunks: ScoredChunk[]
): AgentPlan {
  return enforceConnectivityPlan(plan, query, chunks, "ctix");
}

const LIST_THREAT_DATA_SLUG = "threat-data/list-threat-data";

/** Route plain "show me the indicators / threat data" to List Threat Data. */
export function enforceListIndicatorsPlan(
  plan: AgentPlan,
  query: string,
  chunks: ScoredChunk[]
): AgentPlan {
  if (!isListIndicatorsQuery(query) && !shouldUseCtixListIndicatorsTemplate(query, "ctix")) {
    return plan;
  }

  const dateRange = parseDateRangeFromQuery(query);
  const cqlBase = 'type = "indicator"';
  const cqlQuery = dateRange
    ? `${cqlBase}${dateRange.cqlFilter}`
    : cqlBase;

  const intro = dateRange
    ? `List threat indicators from the **${dateRange.phrase}** using **Get Threat Data List** (POST ingestion/threat-data/list/). ` +
      `Filter with CQL: "${cqlBase}" plus a **created date** range (timestamps calculated automatically in code — you do not need to supply epoch time).`
    : 'List threat data with **Get Threat Data List** (POST ingestion/threat-data/list/). ' +
      'Use a filter like type = "indicator" and set page_size to control how many you get back.';

  const { steps, citations } = planStepsForSlugs([LIST_THREAT_DATA_SLUG], chunks, intro);

  const baseStep: AgentPlanStep =
    steps[0] ??
    ({
      slug: LIST_THREAT_DATA_SLUG,
      order: 1,
      explanation: intro,
    } as AgentPlanStep);

  const stepWithParams: AgentPlanStep = {
    ...baseStep,
    params: {
      query: { page_size: "100", page: "1", sort: "-ctix_created" },
      body: { query: cqlQuery },
    },
  };

  return {
    ...plan,
    confidence: Math.max(plan.confidence, 0.92),
    workflow: intro,
    steps: [{ ...stepWithParams, order: 1 }],
    citations,
    questions: undefined,
  };
}

function matchAppPattern(query: string): (typeof APP_PATTERNS)[0] | null {
  const q = query.toLowerCase();
  let best: (typeof APP_PATTERNS)[0] | null = null;
  let bestHits = 0;
  for (const pattern of APP_PATTERNS) {
    const hits = pattern.keywords.filter((k) => q.includes(k)).length;
    if (hits > bestHits) {
      bestHits = hits;
      best = pattern;
    }
  }
  return bestHits >= 2 ? best : null;
}

export function planAppFromRetrieval(
  query: string,
  chunks: ScoredChunk[],
  confidence: number
): AgentPlan & { appTitle?: string } {
  const pattern = matchAppPattern(query);
  if (pattern) {
    const steps = stepsFromSlugs(pattern.slugs, chunks, pattern.intro);
    return {
      workflow:
        `App blueprint: **${pattern.title}**\n\n${pattern.intro}\n\n` +
        `Run the workflow steps below to validate each API call, then use the generated app scaffold. ` +
        `Credentials stay in server env vars — never in the frontend.`,
      confidence: Math.max(confidence, 0.75),
      steps,
      citations: steps.map((s) => {
        const chunk = chunks.find((c) => c.slug === s.slug);
        return chunk
          ? citationFromChunk(chunk)
          : { slug: s.slug, title: s.slug, url: `/docs/${s.slug}` };
      }),
      appTitle: pattern.title,
    };
  }
  const base = planFromRetrieval(query, chunks, confidence);
  return {
    ...base,
    workflow:
      `App scaffold based on documented endpoints:\n\n${base.workflow}\n\n` +
      `Customize parameters in each step, then download the generated Next.js files.`,
    appTitle: undefined,
  };
}

function stepsFromSlugs(
  slugs: string[],
  chunks: ScoredChunk[],
  intro: string
): AgentPlanStep[] {
  const bySlug = new Map(chunks.map((c) => [c.slug, c]));
  return slugs.map((slug, i) => {
    const chunk = bySlug.get(slug);
    const lead = chunk?.text.split("\n\n")[0]?.slice(0, 280);
    return {
      slug,
      order: i + 1,
      explanation:
        i === 0
          ? intro
          : lead ?? chunk?.title ?? `Use the documented ${slug.split("/").pop()?.replace(/-/g, " ")} endpoint.`,
    };
  });
}

export function planFromRetrieval(
  query: string,
  chunks: ScoredChunk[],
  confidence: number,
  productId = "ctix"
): AgentPlan {
  const productLabel = getProductOrThrow(productId).displayLabel;
  const endpoints = endpointChunks(chunks);
  const pattern = productId === "ctix" ? matchWorkflowPattern(query) : null;

  let steps: AgentPlanStep[];
  let workflow: string;

  if (pattern) {
    steps = stepsFromSlugs(pattern.slugs, chunks, pattern.intro);
    workflow = `${pattern.intro}\n\nThis workflow uses documented ${productLabel} endpoints only. Adjust IDs and payloads for your tenant.`;
  } else if (endpoints.length > 0) {
    steps = endpoints.slice(0, 4).map((c, i) => ({
      slug: c.slug,
      order: i + 1,
      explanation:
        i === 0
          ? `Closest documented match for your request: ${c.method} ${c.path}.`
          : c.text.split("\n\n")[0]?.slice(0, 240) ?? c.title,
    }));
    workflow =
      `I found ${steps.length} relevant documented ${productLabel} endpoint${steps.length === 1 ? "" : "s"} for your request. ` +
      `Review each step below and open the linked docs for full parameter details.`;
  } else {
    return {
      workflow:
        `I couldn't find a confident match in the ${productLabel} API docs. Try naming a resource more specifically or browse /docs/${productId === "ctix" ? "" : productId + "/"} in the sidebar.`,
      confidence: 0,
      steps: [],
      citations: chunks.slice(0, 3).map(citationFromChunk),
      questions: [
        `Which ${productLabel} object are you working with?`,
        "Do you need to read data, create/update it, or run a connectivity check?",
      ],
    };
  }

  const citations = [...new Map(steps.map((s) => {
    const chunk = chunks.find((c) => c.slug === s.slug);
    return [s.slug, chunk ? citationFromChunk(chunk) : { slug: s.slug, title: s.slug, url: docsUrlForProduct(productId, s.slug) }];
  })).values()];

  return { workflow, confidence, steps, citations };
}

const TAG_TO_INDICATOR_BULK_SLUG =
  "threat-data/bulk-actions/bulk-add-remove-tags/bulk-add-remove-tags";

/** Wrong endpoints the LLM often picks for "add tag to indicator". */
const TAG_INDICATOR_WRONG_SLUG =
  /tag-groups\/bulk-action|enable-bulk-tag-group|disable-bulk-tag-group|ingestion\/tags\/bulk-actions/i;

/** Force the documented tag→indicator workflow; drop tag-group bulk-action mistakes. */
export function enforceTagIndicatorPlan(
  plan: AgentPlan,
  query: string,
  chunks: ScoredChunk[]
): AgentPlan {
  if (!isTagToIndicatorQuery(query)) return plan;

  const pattern = matchWorkflowPattern(query);
  if (pattern) {
    const steps = stepsFromSlugs(pattern.slugs, chunks, pattern.intro);
    return {
      ...plan,
      workflow:
        `${pattern.intro}\n\n**Important:** Use **Bulk Add Tags** on threat data (` +
        `\`object_ids\` + \`data.tag_id\`) — not Tag Group bulk actions (\`ids\` + \`action\`).`,
      steps,
      citations: steps.map((s) => {
        const chunk = chunks.find((c) => c.slug === s.slug);
        return chunk
          ? citationFromChunk(chunk)
          : { slug: s.slug, title: s.slug, url: `/docs/${s.slug}` };
      }),
    };
  }

  const filtered = plan.steps.filter((s) => !TAG_INDICATOR_WRONG_SLUG.test(s.slug));
  const hasBulk = filtered.some((s) => s.slug === TAG_TO_INDICATOR_BULK_SLUG);
  const steps = hasBulk
    ? filtered
    : [
        ...filtered,
        {
          slug: TAG_TO_INDICATOR_BULK_SLUG,
          order: filtered.length + 1,
          explanation:
            "Bulk-add the tag to indicators using object_type, object_ids (indicator UUIDs), and data.tag_id.",
        },
      ];

  return {
    ...plan,
    steps: steps.map((s, i) => ({ ...s, order: i + 1 })),
    workflow:
      plan.workflow +
      "\n\n**Note:** Adding a tag to an indicator uses **Bulk Add Tags** (`object_ids` + `data.tag_id`), " +
      "not **Enable Bulk Tag Group** (`ids` is for tag *groups*, not indicators).",
  };
}

/**
 * @deprecated Retained for compatibility. The LLM prompt now uses
 * `formatTrimmedContext` (see `trim-context.ts`) to send only relevant data.
 */
export function formatChunksForPrompt(chunks: ScoredChunk[]): string {
  return chunks
    .slice(0, 10)
    .map(
      (c, i) =>
        `[${i + 1}] slug=${c.slug} kind=${c.kind}${c.method ? ` method=${c.method}` : ""}${c.path ? ` path=${c.path}` : ""}\n${c.text.slice(0, 900)}`
    )
    .join("\n\n---\n\n");
}

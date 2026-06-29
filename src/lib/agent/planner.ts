import type { AgentCitation, AgentPlan, AgentPlanStep, ScoredChunk } from "./types";
import { parseDateRangeFromQuery } from "./date-range";
import {
  buildCtixListIndicatorsAnswer,
  shouldUseCtixListIndicatorsTemplate,
} from "./non-technical";
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
    /\b(ctix|cftr|csap|orchestrate)\b.*\b(access\s*id|secret\s*key|credential)/.test(q)
  );
}

export function isSetupInfoQuery(query: string): boolean {
  return isBaseUrlQuery(query) || isCredentialsQuery(query);
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
export function enforceCatalogPlan(plan: AgentPlan, query: string): AgentPlan {
  if (!isCatalogQuery(query)) return plan;

  const workflow =
    "**Documented Cyware APIs on this site:**\n\n" +
    listProducts()
      .map(
        (p) =>
          `- **${p.displayLabel}** — ${p.description} (` +
          `\`/docs/${p.productId === "ctix" ? "intel-exchange-api-reference" : p.productId}/…\`)`
      )
      .join("\n") +
    "\n\nEach product uses its **own** Access ID + Secret Key. Name the product in your question " +
    '(e.g. "CFTR: list incidents") or switch **Product** in the header.';

  return {
    workflow,
    confidence: 0.95,
    steps: [],
    citations: listProducts().map((p) => ({
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
const INCIDENTS_LIST_PATTERN =
  /\bincidents?\b.*\b(list|get|show|all|fetch|view|retrieve)\b|\b(list|get|show|all|fetch|view|retrieve)\b.*\bincidents?\b/i;
const ALERTS_PATTERN = /\b(analyst portal )?(alert|alerts)\b/i;
const INTEL_CATEGORIES_PATTERN = /\b(intel\s*)?(categories?|category)\b/i;
const VERSION_PATTERN = /\b(product\s*)?(release\s*)?version\b/i;

const PRODUCT_DOC_INTENTS: Record<
  string,
  { pattern: RegExp; slug: string; title: string; intro: string }[]
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
      pattern: /\bincidents?\b/i,
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
    `Each Cyware product uses a separate key pair — you cannot reuse CTIX credentials on other APIs.`
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

  const useTemplate =
    shouldUseCtixListIndicatorsTemplate(query, "ctix") || /\bnot\s+technical\b/i.test(query);

  const workflow = useTemplate
    ? buildCtixListIndicatorsAnswer({
        query,
        productId: "ctix",
        dateRange,
        steps: [],
        scripts: undefined,
      })
    : intro;

  return {
    ...plan,
    confidence: Math.max(plan.confidence, 0.92),
    workflow,
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

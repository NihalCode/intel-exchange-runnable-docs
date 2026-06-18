import type { AgentCitation, AgentPlan, AgentPlanStep, ScoredChunk } from "./types";
import { extractTagNameFromQuery } from "../workflow-step-context";

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
  return {
    slug: chunk.slug,
    title: chunk.title,
    url: `/docs/${chunk.slug}`,
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

/** "is the connection working / test the api / ping" → Ping. */
export function isPingQuery(query: string): boolean {
  const q = query.toLowerCase();
  return (
    /\bping\b/.test(q) ||
    /\b(connection|connectivity|reachable|api)\b.*\b(work|working|up|live|ok|alive|test)\b/.test(q) ||
    /\b(test|check)\b.*\b(connection|connectivity|api|reachab)/.test(q) ||
    /\bis (it|the api|the connection|everything) working\b/.test(q)
  );
}

export function enforcePingPlan(
  plan: AgentPlan,
  query: string,
  chunks: ScoredChunk[]
): AgentPlan {
  if (!isPingQuery(query)) return plan;
  const intro =
    "Check connectivity with **Ping** (`GET ping/`). A 200 response means the API and your credentials are working.";
  const { steps, citations } = planStepsForSlugs([PING_SLUG], chunks, intro);
  if (steps.length === 0) return plan; // ping chunk not retrieved; leave as-is
  return {
    ...plan,
    confidence: Math.max(plan.confidence, 0.9),
    workflow: intro,
    steps,
    citations,
    questions: undefined,
  };
}

const LIST_THREAT_DATA_SLUG = "threat-data/list-threat-data";

/** Route plain "show me the indicators / threat data" to List Threat Data. */
export function enforceListIndicatorsPlan(
  plan: AgentPlan,
  query: string,
  chunks: ScoredChunk[]
): AgentPlan {
  if (!isListIndicatorsQuery(query)) return plan;
  const intro =
    "List threat data with **Get Threat Data List** (`POST ingestion/threat-data/list/`). " +
    'Use a CQL query like `type = "indicator"` and set `page_size` to control how many you get back.';
  const { steps, citations } = planStepsForSlugs([LIST_THREAT_DATA_SLUG], chunks, intro);
  return {
    ...plan,
    confidence: Math.max(plan.confidence, 0.8),
    workflow: intro,
    steps,
    citations,
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
  confidence: number
): AgentPlan {
  const endpoints = endpointChunks(chunks);
  const pattern = matchWorkflowPattern(query);

  let steps: AgentPlanStep[];
  let workflow: string;

  if (pattern) {
    steps = stepsFromSlugs(pattern.slugs, chunks, pattern.intro);
    workflow = `${pattern.intro}\n\nThis workflow uses documented Intel Exchange endpoints only. Adjust collection IDs and STIX payloads for your tenant.`;
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
      `I found ${steps.length} relevant documented endpoint${steps.length === 1 ? "" : "s"} for your request. ` +
      `Review each step below and open the linked docs for full parameter details.`;
  } else {
    return {
      workflow:
        "I couldn't find a confident match in the Intel Exchange API docs. Try naming a resource (e.g. threat data, import intel, collections) or browse the sidebar.",
      confidence: 0,
      steps: [],
      citations: chunks.slice(0, 3).map(citationFromChunk),
      questions: [
        "Which CTIX object are you working with (threat data, collections, rules, etc.)?",
        "Do you need to read data, create/update it, or import a file?",
      ],
    };
  }

  const citations = [...new Map(steps.map((s) => {
    const chunk = chunks.find((c) => c.slug === s.slug);
    return [s.slug, chunk ? citationFromChunk(chunk) : { slug: s.slug, title: s.slug, url: `/docs/${s.slug}` }];
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

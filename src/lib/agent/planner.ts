import type { AgentCitation, AgentPlan, AgentPlanStep, ScoredChunk } from "./types";

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

export function formatChunksForPrompt(chunks: ScoredChunk[]): string {
  return chunks
    .slice(0, 10)
    .map(
      (c, i) =>
        `[${i + 1}] slug=${c.slug} kind=${c.kind}${c.method ? ` method=${c.method}` : ""}${c.path ? ` path=${c.path}` : ""}\n${c.text.slice(0, 900)}`
    )
    .join("\n\n---\n\n");
}

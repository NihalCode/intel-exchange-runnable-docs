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

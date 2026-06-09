import "server-only";

import { getManifest, getPage } from "../content";
import { DISPLAY_BASE } from "../constants";
import { generateStepCode } from "./codegen";
import { loadAgentIndex } from "./load-index";
import { embedQuery, planWithLlm } from "./llm";
import { planFromRetrieval } from "./planner";
import {
  confidenceFromScores,
  isLowConfidence,
  retrieveLexical,
  retrieveWithEmbedding,
} from "./retrieve";
import type {
  AgentRequest,
  AgentResponse,
  AgentStepResult,
} from "./types";
import type { EndpointPage } from "../types";
import { validatePlan } from "./validate";

function endpointSlugSet(): Set<string> {
  return new Set(
    getManifest().pages.filter((p) => p.kind === "endpoint").map((p) => p.slug)
  );
}

export async function runAgent(req: AgentRequest): Promise<AgentResponse> {
  const query = req.query?.trim();
  if (!query) {
    return {
      workflow: "Please describe what you want to do with the Intel Exchange API.",
      confidence: 0,
      fallback: true,
      citations: [],
      steps: [],
    };
  }

  const index = await loadAgentIndex();
  const apiKey = req.llmApiKey?.trim() || process.env.OPENAI_API_KEY?.trim();
  const language = req.language ?? "python";
  const baseUrl = getManifest().defaultBaseUrl || DISPLAY_BASE;

  let scored = retrieveLexical(query, index, 14);

  if (apiKey && index.hasEmbeddings) {
    try {
      const embedding = await embedQuery(query, apiKey);
      scored = retrieveWithEmbedding(query, index, embedding, 14);
    } catch {
      /* lexical only */
    }
  }

  const confidence = confidenceFromScores(scored);
  const lowConfidence = isLowConfidence(scored);

  let plan;
  if (apiKey && !lowConfidence) {
    try {
      plan = await planWithLlm(query, scored, apiKey, req.history);
    } catch {
      plan = planFromRetrieval(query, scored, confidence);
    }
  } else {
    plan = planFromRetrieval(query, scored, confidence);
  }

  const endpointSlugs = endpointSlugSet();
  const pages = new Map<string, EndpointPage>();

  for (const step of plan.steps) {
    if (pages.has(step.slug)) continue;
    const page = await getPage(step.slug);
    if (page?.kind === "endpoint") {
      pages.set(step.slug, page);
    }
  }

  const { steps: validated, dropped } = validatePlan(plan, pages, endpointSlugs);

  const stepResults: AgentStepResult[] = [];
  for (const step of validated) {
    const page = pages.get(step.slug);
    if (!page) continue;
    const { code, request } = generateStepCode(page, step.params, language, baseUrl);
    stepResults.push({
      ...step,
      code,
      request,
    });
  }

  const fallback =
    lowConfidence ||
    stepResults.length === 0 ||
    (dropped.length > 0 && stepResults.length < plan.steps.length);

  const titleBySlug = new Map(getManifest().pages.map((p) => [p.slug, p.title]));

  return {
    workflow: plan.workflow,
    confidence: plan.confidence ?? confidence,
    fallback,
    citations: plan.citations.map((c) => ({
      ...c,
      title: titleBySlug.get(c.slug) ?? c.title,
    })),
    steps: stepResults,
    questions: plan.questions,
    retrieval: scored.slice(0, 5).map((c) => ({
      slug: c.slug,
      title: c.title,
      score: Number(c.score.toFixed(3)),
    })),
  };
}

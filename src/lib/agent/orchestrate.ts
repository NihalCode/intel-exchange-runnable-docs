import "server-only";

import { getManifest, getPage } from "../content";
import { DISPLAY_BASE } from "../constants";
import { appTitleFromQuery, generateAppBlueprint } from "./app-builder";
import { generateStepCode } from "./codegen";
import { loadAgentIndex } from "./load-index";
import { embedQuery, planWithLlm } from "./llm";
import { detectAgentMode } from "./mode";
import { planAppFromRetrieval, planFromRetrieval } from "./planner";
import {
  confidenceFromScores,
  isLowConfidence,
  retrieveLexical,
  retrieveWithEmbedding,
} from "./retrieve";
import { buildStepPlaygroundMeta, buildStepSpec } from "./spec";
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

async function buildStepResults(
  validated: ReturnType<typeof validatePlan>["steps"],
  pages: Map<string, EndpointPage>,
  language: AgentRequest["language"],
  baseUrl: string
): Promise<AgentStepResult[]> {
  const stepResults: AgentStepResult[] = [];
  for (const step of validated) {
    const page = pages.get(step.slug);
    if (!page) continue;
    const { code, request } = generateStepCode(page, step.params, language ?? "python", baseUrl);
    stepResults.push({
      ...step,
      code,
      request,
      meta: buildStepPlaygroundMeta(page),
      spec: buildStepSpec(page, request, baseUrl),
    });
  }
  return stepResults;
}

export async function runAgent(req: AgentRequest): Promise<AgentResponse> {
  const query = req.query?.trim();
  const mode = detectAgentMode(query ?? "", req.mode);

  if (!query) {
    return {
      mode,
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

  // Combine recent user turns so follow-ups like "add pagination" still retrieve relevant docs
  const retrievalQuery = req.history?.length
    ? [
        ...req.history.filter((h) => h.role === "user").slice(-2).map((h) => h.content),
        query,
      ].join(" ")
    : query;

  let scored = retrieveLexical(retrievalQuery, index, mode === "app" ? 20 : 14);

  if (apiKey && index.hasEmbeddings) {
    try {
      const embedding = await embedQuery(retrievalQuery, apiKey);
      scored = retrieveWithEmbedding(retrievalQuery, index, embedding, mode === "app" ? 20 : 14);
    } catch {
      /* lexical only */
    }
  }

  const confidence = confidenceFromScores(scored);
  const lowConfidence = isLowConfidence(scored);

  let plan: ReturnType<typeof planFromRetrieval> & { appTitle?: string };
  if (mode === "app") {
    plan = planAppFromRetrieval(query, scored, confidence);
  } else if (apiKey && !lowConfidence) {
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
  const stepResults = await buildStepResults(validated, pages, language, baseUrl);

  const fallback =
    lowConfidence ||
    stepResults.length === 0 ||
    (dropped.length > 0 && stepResults.length < plan.steps.length);

  const titleBySlug = new Map(getManifest().pages.map((p) => [p.slug, p.title]));

  const response: AgentResponse = {
    mode,
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

  if (mode === "app" && stepResults.length > 0) {
    const title = plan.appTitle ?? appTitleFromQuery(query);
    response.app = generateAppBlueprint(
      query,
      title,
      plan.workflow,
      stepResults
    );
  }

  return response;
}

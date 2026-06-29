import "server-only";

import { getManifest, getPage, getProductManifest } from "../content";
import { baseUrlForProduct } from "../products/auth";
import { DEFAULT_PRODUCT_ID, getProductOrThrow, inferProductFromQuery } from "../products/registry";
import { loadCombinedAgentIndex } from "../products/search";
import { loadAgentIndex } from "./load-index";
import { resolveProductScope, productScopeForFilter } from "./product-scope";
import { appTitleFromQuery, generateAppBlueprint } from "./app-builder";
import { diffAppFiles, slugifyProjectName } from "./app-diff";
import { applyRuleBasedEdits } from "./app-edit-rules";
import { attachDiff, editAppWithLlm } from "./edit-app";
import { repairBlueprint } from "./repair-app";
import { generateStepCode } from "./codegen";
import { embedQuery, planWithLlm } from "./llm";
import { detectAgentMode, resolveAgentRun, isExplainQuery } from "./intent";
import { enrichWorkflowWithTemplate } from "./explain-simple";
import {
  filterClarifyingQuestions,
  defaultSimpleMode,
  softenDocsModeNote,
  buildCtixListIndicatorsAnswer,
  shouldUseCtixListIndicatorsTemplate,
} from "./non-technical";
import { parseDateRangeFromQuery } from "./date-range";
import {
  planAppFromRetrieval,
  planFromRetrieval,
  enforceTagIndicatorPlan,
  enforceTagManagementPlan,
  enforceListIndicatorsPlan,
  enforceConnectivityPlan,
  enforceReportDownloadPlan,
  enforceSetupInfoPlan,
  enforceCatalogPlan,
  enforceProductDocPlan,
  isCatalogQuery,
  isReportDownloadQuery,
  isPingQuery,
  isSetupInfoQuery,
} from "./planner";
import {
  confidenceFromScores,
  isLowConfidence,
  retrieveLexical,
  retrieveWithEmbedding,
  scoredChunksByIds,
  boostByProducts,
  filterByProducts,
  boostEndpointMatches,
} from "./retrieve";
import { getPineconeConfig, queryPinecone } from "./pinecone";
import { canonicalizeIntent, expandQueryForRetrieval, isVagueQuery } from "./normalize-query";
import { buildWorkflowScripts, applyScriptPlanToSteps } from "./script-builder";
import { extractTagNameFromQuery } from "../workflow-step-context";
import { buildStepPlaygroundMeta, buildStepSpec } from "./spec";
import type {
  AgentAppBlueprint,
  AgentRequest,
  AgentResponse,
  AgentStepResult,
  ExistingAppContext,
  ScoredChunk,
} from "./types";
import type { EndpointPage } from "../types";
import { validatePlan } from "./validate";
import { isLiveApiUiEnabled } from "../public-docs-mode";
import { isOpenAiConfigured, OpenAiNotConfiguredError } from "../openai/client";

async function endpointSlugSetForProduct(productId: string): Promise<Set<string>> {
  const manifest = (await getProductManifest(productId)) ?? getManifest();
  return new Set(manifest.pages.filter((p) => p.kind === "endpoint").map((p) => p.slug));
}

function filterByProductScope(scored: ScoredChunk[], scope: ReturnType<typeof resolveProductScope>): ScoredChunk[] {
  if (scope.filterMode === "all") return scored;
  if (scope.filterMode === "multi") {
    return boostByProducts(filterByProducts(scored, scope.productIds), scope.productIds);
  }
  return scored.filter((c) => (c.productId ?? "ctix") === scope.primaryProductId);
}

async function buildStepResults(
  validated: ReturnType<typeof validatePlan>["steps"],
  pages: Map<string, EndpointPage>,
  language: AgentRequest["language"],
  baseUrl: string,
  productId: string
): Promise<AgentStepResult[]> {
  const stepResults: AgentStepResult[] = [];
  for (const step of validated) {
    const page = pages.get(step.slug);
    if (!page) continue;
    const { code, request } = generateStepCode(
      page,
      step.params,
      language ?? "python",
      baseUrl,
      productId
    );
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

function blueprintFromContext(ctx: ExistingAppContext): AgentAppBlueprint {
  return {
    title: ctx.title,
    description: "Saved Cyware integration app",
    architecture: [
      "Browser (React UI)",
      "  ↓ fetch /api/cyware/*",
      "Next.js API Routes (server)",
      "  ↓ HMAC-signed requests",
      "Cyware Intel Exchange Open API",
    ].join("\n"),
    setupInstructions:
      "Copy .env.example → .env.local, add Cyware credentials, npm install && npm run dev.",
    envExample: ctx.files.find((f) => f.path === ".env.example")?.code ?? "",
    files: ctx.files.map((f) => ({
      path: f.path,
      code: f.code,
      language: f.language ?? "typescript",
      description: f.description ?? f.path,
    })),
    appId: ctx.appId,
    version: ctx.version,
    vercelProjectName: ctx.vercelProjectName,
    deploymentUrl: ctx.deploymentUrl,
  };
}

export async function runAgent(req: AgentRequest): Promise<AgentResponse> {
  const query = req.query?.trim();
  const { mode, editExistingApp: hasExistingApp } = resolveAgentRun(req);

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

  const apiKeyConfigured = isOpenAiConfigured();

  // Edit path: patch existing app in place (never silently regenerate from scratch)
  if (hasExistingApp) {
    const ctx = req.existingApp!;
    const previous = ctx.files;
    const { blueprint: base, notes: prepNotes } = repairBlueprint(blueprintFromContext(ctx));

    try {
      let edited: { blueprint: AgentAppBlueprint; summary: string; changedPaths: string[] };

      if (apiKeyConfigured) {
        edited = await editAppWithLlm(query, base, req.history);
      } else {
        const ruleResult = applyRuleBasedEdits(query, base);
        if (!ruleResult) {
          const err = new OpenAiNotConfiguredError();
          return {
            mode: "app",
            workflow: err.clientMessage,
            confidence: 0,
            fallback: true,
            citations: [],
            steps: [],
            app: base,
          };
        }
        edited = ruleResult;
        if (prepNotes.length > 0) {
          edited = {
            ...edited,
            summary: `${edited.summary} (auto-repaired: ${prepNotes.slice(0, 2).join("; ")})`,
          };
        }
      }

      const fromVersion = ctx.version ?? 0;
      const toVersion = fromVersion + 1;
      const diff = diffAppFiles(previous, edited.blueprint.files, edited.summary);

      if (diff.files.length === 0) {
        return {
          mode: "app",
          workflow:
            "No file changes were detected. Try being more specific about which file to change " +
            `(e.g. app/page.tsx). Request: "${query}"`,
          confidence: 0.5,
          fallback: true,
          citations: [],
          steps: [],
          app: base,
        };
      }

      return {
        mode: "app",
        workflow: edited.summary,
        confidence: 0.95,
        fallback: false,
        citations: [],
        steps: [],
        app: {
          ...edited.blueprint,
          appId: ctx.appId,
          version: toVersion,
          vercelProjectName: ctx.vercelProjectName ?? slugifyProjectName(edited.blueprint.title),
          deploymentUrl: ctx.deploymentUrl,
        },
        appDiff: attachDiff(diff, fromVersion, toVersion, edited.summary),
        appEdit: true,
      };
    } catch (err) {
      const message =
        err instanceof OpenAiNotConfiguredError
          ? err.clientMessage
          : err instanceof Error
            ? err.message
            : "App edit failed";
      return {
        mode: "app",
        workflow: `Edit failed: ${message}`,
        confidence: 0,
        fallback: true,
        citations: [],
        steps: [],
        app: base,
      };
    }
  }

  const scope = resolveProductScope(req, query);
  const activeProductId = scope.primaryProductId;
  const simpleMode = defaultSimpleMode(query);
  const retrievalFilter = productScopeForFilter(scope);

  if (
    scope.filterMode === "all" &&
    scope.source === "all" &&
    !inferProductFromQuery(query) &&
    !isCatalogQuery(query) &&
    /\b(create|update|delete|get|list|how do i)\b/i.test(query)
  ) {
    return {
      mode,
      workflow: "Which Cyware product is this for?",
      confidence: 0,
      fallback: true,
      citations: [],
      steps: [],
      questions: [
        "CTIX / Intel Exchange — threat intelligence and STIX",
        "CSAP — situational awareness and collaboration",
        "Cyware Orchestrate — playbooks and integrations",
        "CFTR — case management and incidents",
        'Or say "search all Cyware APIs" for cross-product search.',
      ],
    };
  }

  let index;
  try {
    index = await loadCombinedAgentIndex();
    if (index.chunkCount === 0) index = await loadAgentIndex();
  } catch {
    index = await loadAgentIndex();
  }

  const language = req.language ?? "python";
  const productManifest = (await getProductManifest(activeProductId)) ?? getManifest();
  const baseUrl = baseUrlForProduct(activeProductId);
  const productLabel = getProductOrThrow(activeProductId).displayLabel;

  // Combine recent user turns so follow-ups like "add pagination" still retrieve relevant docs
  const baseRetrievalQuery = req.history?.length
    ? [
        ...req.history.filter((h) => h.role === "user").slice(-2).map((h) => h.content),
        query,
      ].join(" ")
    : query;

  // Simpler-prompt support: expand casual phrasing into canonical doc terms.
  const retrievalQuery = expandQueryForRetrieval(
    baseRetrievalQuery,
    scope.filterMode === "single" ? scope.primaryProductId : undefined
  );

  const topK = mode === "app" ? 20 : 14;
  let scored = filterByProductScope(
    retrieveLexical(retrievalQuery, index, topK * 3),
    scope
  ).slice(0, topK);

  if (scope.filterMode === "single") {
    scored = boostEndpointMatches(scored, retrievalQuery, scope.primaryProductId);
  } else if (scope.filterMode === "multi") {
    scored = boostByProducts(scored, scope.productIds);
    scored = boostEndpointMatches(scored, retrievalQuery);
  } else {
    scored = boostEndpointMatches(scored, retrievalQuery);
  }
  scored = scored.slice(0, topK);

  // Preferred path: embed query, then retrieve from Pinecone. Falls back to the
  // local hybrid/lexical index whenever creds are missing or any call fails, so
  // tests, the SSG build, and offline dev keep working unchanged.
  if (apiKeyConfigured) {
    try {
      const embedding = await embedQuery(retrievalQuery);
      const pineconeCfg = getPineconeConfig();
      let usedPinecone = false;
      if (pineconeCfg) {
        const matches = await queryPinecone(
          embedding,
          topK,
          pineconeCfg,
          retrievalFilter === "all" ? undefined : retrievalFilter
        );
        const fromPinecone = filterByProductScope(
          scoredChunksByIds(matches, index),
          scope
        ).slice(0, topK);
        if (fromPinecone.length > 0) {
          scored = fromPinecone;
          usedPinecone = true;
        }
      }
      if (!usedPinecone && index.hasEmbeddings) {
        scored = filterByProductScope(
          retrieveWithEmbedding(retrievalQuery, index, embedding, topK * 2),
          scope
        ).slice(0, topK);
      }
    } catch {
      /* lexical only */
    }
  }

  const confidence = confidenceFromScores(scored);
  const lowConfidence = isLowConfidence(scored);

  let plan: ReturnType<typeof planFromRetrieval> & { appTitle?: string };
  if (mode === "app") {
    plan = planAppFromRetrieval(query, scored, confidence);
  } else if (apiKeyConfigured && !lowConfidence) {
    try {
      plan = await planWithLlm(query, scored, req.history, activeProductId, simpleMode);
    } catch {
      plan = planFromRetrieval(query, scored, confidence, activeProductId);
    }
  } else {
    plan = planFromRetrieval(query, scored, confidence, activeProductId);
  }

  if (mode === "workflow") {
    plan = enforceCatalogPlan(plan, query);
    plan = enforceSetupInfoPlan(plan, query, scope.filterMode === "all" ? "all" : activeProductId);

    if (!isSetupInfoQuery(query) && !isCatalogQuery(query)) {
      plan = enforceConnectivityPlan(plan, query, scored, activeProductId);
    }

    if (activeProductId === "ctix" && !isPingQuery(query)) {
      // Canonicalize casual nouns (label->tag, bad ips->indicator) so the
      // rule-based enforcers fire for non-technical phrasing.
      const intentQuery = canonicalizeIntent(query);
      plan = enforceReportDownloadPlan(plan, intentQuery, scored);
      if (!isReportDownloadQuery(intentQuery)) {
        plan = enforceTagManagementPlan(plan, intentQuery, scored);
        plan = enforceTagIndicatorPlan(plan, intentQuery, scored);
        plan = enforceListIndicatorsPlan(plan, intentQuery, scored);
      }

      // Non-technical nudge: only when truly vague — not when CTIX/indicators/date are named.
      if (
        isVagueQuery(query) &&
        plan.steps.length === 0 &&
        !shouldUseCtixListIndicatorsTemplate(query, activeProductId)
      ) {
        plan = {
          ...plan,
          questions: filterClarifyingQuestions(
            plan.questions ?? [
              "What would you like to do — view, create, update, or delete something?",
              "Which item is this about (for example: tags, indicators, threat data, or feeds)?",
            ],
            query
          ),
        };
      }
    }

    if (!isSetupInfoQuery(query) && !isCatalogQuery(query)) {
      plan = enforceProductDocPlan(plan, query, scored, activeProductId);
    }
  }

  const primarySlug = plan.steps[0]?.slug;
  plan = {
    ...plan,
    questions: filterClarifyingQuestions(plan.questions, query, primarySlug),
  };

  const endpointSlugs = await endpointSlugSetForProduct(activeProductId);
  const pages = new Map<string, EndpointPage>();

  for (const step of plan.steps) {
    if (pages.has(step.slug)) continue;
    const page = await getPage(activeProductId, step.slug);
    if (page?.kind === "endpoint") {
      pages.set(step.slug, page);
    }
  }

  const { steps: validated, dropped } = validatePlan(plan, pages, endpointSlugs);
  let stepResults = await buildStepResults(validated, pages, language, baseUrl, activeProductId);
  if (mode === "workflow" && stepResults.length > 0) {
    stepResults = applyScriptPlanToSteps(stepResults, query);
  }

  const setupInfoAnswer = isSetupInfoQuery(query) && (plan.confidence ?? 0) >= 0.9;
  const catalogAnswer = isCatalogQuery(query) && (plan.confidence ?? 0) >= 0.9;
  const fallback =
    (!setupInfoAnswer &&
      !catalogAnswer &&
      (lowConfidence ||
        stepResults.length === 0 ||
        (dropped.length > 0 && stepResults.length < plan.steps.length)));

  const titleBySlug = new Map(productManifest.pages.map((p) => [p.slug, p.title]));

  const tagName = activeProductId === "ctix" ? extractTagNameFromQuery(canonicalizeIntent(query)) : undefined;

  const workflowPrefix = scope.filterMode === "all" ? "[All products] " : `[${productLabel}] `;

  const workflowText = plan.workflow.startsWith("[")
    ? plan.workflow
    : plan.workflow.includes("## What you're trying to do")
      ? plan.workflow
      : `${workflowPrefix}${plan.workflow}`;

  const response: AgentResponse = {
    mode,
    workflow: workflowText,
    confidence: plan.confidence ?? confidence,
    fallback,
    citations: plan.citations.map((c) => ({
      ...c,
      title: titleBySlug.get(c.slug) ?? c.title,
    })),
    steps: stepResults,
    tagName,
    docsModeNote: isLiveApiUiEnabled() ? undefined : softenDocsModeNote(),
    questions: plan.questions,
    productContext: {
      products: scope.products,
      source: scope.source,
      label: scope.label,
    },
    simpleMode,
    retrieval: scored.slice(0, 5).map((c) => ({
      slug: c.slug,
      title: `[${c.productId ?? activeProductId}] ${c.title}`,
      score: Number(c.score.toFixed(3)),
    })),
  };

  if (mode === "app" && stepResults.length > 0) {
    const title = plan.appTitle ?? appTitleFromQuery(query);
    response.app = generateAppBlueprint(query, title, plan.workflow, stepResults);
  }

  if (mode === "workflow" && stepResults.length > 0) {
    response.scripts = buildWorkflowScripts(
      stepResults,
      baseUrl,
      plan.appTitle ?? appTitleFromQuery(query),
      ["python", "javascript"],
      activeProductId
    );
  }

  if (isExplainQuery(query) || simpleMode) {
    response.workflow = enrichWorkflowWithTemplate(response, query);
  } else if (
    mode === "workflow" &&
    shouldUseCtixListIndicatorsTemplate(query, activeProductId) &&
    stepResults.length > 0 &&
    !response.workflow.includes("## What you're trying to do")
  ) {
    response.workflow = buildCtixListIndicatorsAnswer({
      query,
      productId: activeProductId,
      dateRange: parseDateRangeFromQuery(query),
      steps: stepResults,
      scripts: response.scripts,
    });
  }

  return response;
}

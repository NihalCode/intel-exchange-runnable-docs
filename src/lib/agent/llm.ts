import type { AgentPlan, ScoredChunk } from "./types";
import { formatTrimmedContext } from "./trim-context";
import { getProductOrThrow } from "../products/registry";
import {
  openAiAuthHeaders,
  openAiChatModel,
  openAiEmbeddingModel,
} from "../openai/client";

const CTIX_TAG_RULES = `To add a tag to indicator(s), use slug threat-data/bulk-actions/bulk-add-remove-tags/bulk-add-remove-tags (Bulk Add Tags) with path param action_type=add_tag and body object_ids + data.tag_id. Do NOT use tag-groups/bulk-action or ingestion/tags/bulk-actions (those are for tag groups, not attaching tags to threat data).
To list, find, or verify a tag by name, use slug tags/list-tags (GET ingestion/tags/) with query q=<name> and tag_type=user — not a full unpaged list. If q search finds the tag, report "already exists" and its id; do not create again.
To create a tag, use slug tags/create-tag (POST ingestion/tags/, body name + colour_code). Prefer a search step with q=<name> before create (find-or-create).
Do NOT use tag-groups, Create Tag Group, or ingestion/tags/bulk-actions for listing tags.`;

function docsUrlForProduct(productId: string, slug: string): string {
  return productId === "ctix" ? `/docs/${slug}` : `/docs/${productId}/${slug}`;
}

function systemPromptForProduct(productId: string): string {
  const product = getProductOrThrow(productId);
  const extra = productId === "ctix" ? `\n${CTIX_TAG_RULES}` : "";
  return (
    `You are a Cyware API documentation assistant for **${product.displayLabel}** only.\n` +
    `You MUST only recommend endpoints whose slug appears in the CONTEXT below.\n` +
    `Never invent endpoints, paths, or parameter names. Never recommend endpoints from other Cyware products.\n` +
    `Return JSON with: workflow (markdown string), confidence (0-1), steps (array), questions (optional clarifying questions).\n` +
    `Each step must include: slug (exact from context), order (1-based), explanation, and optional pathParams/queryParams/body/form objects using ONLY documented parameter names.` +
    extra +
    `\nIf the request is ambiguous, set confidence below 0.5 and include questions.`
  );
}

interface LlmPlanJson {
  workflow?: string;
  confidence?: number;
  steps?: {
    slug?: string;
    order?: number;
    explanation?: string;
    pathParams?: Record<string, string>;
    queryParams?: Record<string, string>;
    body?: Record<string, unknown>;
    form?: Record<string, string>;
  }[];
  questions?: string[];
}

export async function embedQuery(text: string): Promise<number[]> {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: openAiAuthHeaders(),
    body: JSON.stringify({
      model: openAiEmbeddingModel(),
      input: text,
      dimensions: 512,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Embedding failed (${res.status}): ${err.slice(0, 200)}`);
  }
  const data = (await res.json()) as { data: { embedding: number[] }[] };
  return data.data[0]?.embedding ?? [];
}

export async function planWithLlm(
  query: string,
  chunks: ScoredChunk[],
  history?: { role: "user" | "assistant"; content: string }[],
  productId = "ctix"
): Promise<AgentPlan> {
  const allowedSlugs = [...new Set(chunks.map((c) => c.slug))];
  const context = formatTrimmedContext(chunks, query, 8);
  const system = systemPromptForProduct(productId);

  const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
    { role: "system", content: system },
  ];
  if (history?.length) {
    for (const h of history.slice(-6)) {
      messages.push({ role: h.role, content: h.content });
    }
  }
  messages.push({
    role: "user",
    content: `User request: ${query}\n\nAllowed slugs: ${allowedSlugs.join(", ")}\n\nCONTEXT:\n${context}`,
  });

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: openAiAuthHeaders(),
    body: JSON.stringify({
      model: openAiChatModel(),
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`LLM plan failed (${res.status}): ${err.slice(0, 300)}`);
  }

  const data = (await res.json()) as {
    choices: { message: { content: string } }[];
  };
  const raw = data.choices[0]?.message?.content ?? "{}";
  let parsed: LlmPlanJson;
  try {
    parsed = JSON.parse(raw) as LlmPlanJson;
  } catch {
    throw new Error("LLM returned invalid JSON plan");
  }

  const allowed = new Set(allowedSlugs);
  const steps = (parsed.steps ?? [])
    .filter((s) => s.slug && allowed.has(s.slug))
    .map((s) => ({
      slug: s.slug!,
      order: s.order ?? 1,
      explanation: s.explanation ?? "",
      params: {
        path: s.pathParams,
        query: s.queryParams,
        body: s.body,
        form: s.form,
      },
    }))
    .sort((a, b) => a.order - b.order);

  const citations = [...new Map(steps.map((s) => {
    const chunk = chunks.find((c) => c.slug === s.slug);
    return [
      s.slug,
      {
        slug: s.slug,
        title: chunk?.title ?? s.slug,
        url: docsUrlForProduct(chunk?.productId ?? productId, s.slug),
      },
    ];
  })).values()];

  return {
    workflow: parsed.workflow ?? "Here is a suggested workflow using documented endpoints.",
    confidence: Math.max(0, Math.min(1, parsed.confidence ?? 0.5)),
    steps,
    questions: parsed.questions,
    citations,
  };
}

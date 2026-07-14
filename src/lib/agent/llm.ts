import type { AgentPlan, ScoredChunk } from "./types";
import { formatTrimmedContext } from "./trim-context";
import { validateLlmPlanPayload } from "./llm-contract";
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

const NON_TECH_RULES = `
NON-TECHNICAL USERS (default when query says "not technical", "plain English", "step by step", or "IT team"):
- Structure workflow markdown with clear headings: What you're trying to do, Use this endpoint, Ask your IT team for, Step-by-step, Example code, What the result means, Common mistakes, Next steps.
- Use simple words. Explain jargon immediately (e.g. "CQL filter" → "a filter that tells CTIX what records to return").
- Always include at least one cURL example with placeholders: <BASE_URL>, <ACCESS_ID>, <SIGNATURE>, <EXPIRES>. Never real credentials.
- Include JavaScript fetch when user asks for code or IT handoff.

CLARIFYING QUESTIONS — STRICT RULES:
- Ask at most 2 questions, ONLY when a required parameter cannot be inferred.
- NEVER ask for epoch/unix timestamps when the user says "last 7 days", "last week", etc. — explain that code calculates timestamps automatically.
- NEVER ask for report IDs, recipient emails, or file tokens unless the matched endpoint is specifically for report download.
- NEVER ask which product when the user already named CTIX, CSAP, Orchestrate, or CFTR.
- If you can answer with documented endpoints, set questions to [] and confidence >= 0.7.

DATE PHRASES ("last 7 days", "yesterday", "last month"):
- For CTIX threat data list, use POST ingestion/threat-data/list/ with CQL type = "indicator" AND ctix_created date range.
- Explain that start/end times are computed automatically; use placeholders <START_TIME> and <END_TIME> in examples.

LISTING CTIX INDICATORS:
- Use slug threat-data/list-threat-data (POST ingestion/threat-data/list/) — NOT report endpoints, NOT email endpoints.
`;

function docsUrlForProduct(productId: string, slug: string): string {
  return productId === "ctix" ? `/docs/${slug}` : `/docs/${productId}/${slug}`;
}

function systemPromptForProduct(productId: string, simpleMode: boolean): string {
  const product = getProductOrThrow(productId);
  const extra = productId === "ctix" ? `\n${CTIX_TAG_RULES}` : "";
  const tone = simpleMode
    ? `\nThe user wants PLAIN ENGLISH guidance.${NON_TECH_RULES}`
    : `\nProvide technical detail when helpful, but still use placeholders in all code.`;

  return (
    `You are a Cyware API documentation assistant for **${product.displayLabel}**.\n` +
    `You MUST only recommend endpoints whose slug appears in the CONTEXT below.\n` +
    `Never invent endpoints, paths, or parameter names. Never recommend endpoints from other Cyware products unless CONTEXT includes them.\n` +
    `Return JSON with: workflow (markdown string), confidence (0-1), steps (array), questions (optional array, max 2, only if absolutely required).\n` +
    `Each step must include: slug (exact from context), order (1-based), explanation, and optional pathParams/queryParams/body/form objects using ONLY documented parameter names.` +
    extra +
    tone +
    `\nIf retrieval truly cannot match any endpoint, set confidence below 0.5 and ask ONE focused question about the missing object type — not generic questionnaires.`
  );
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
    throw new Error("Embedding request failed.");
  }
  const data = (await res.json()) as { data: { embedding: number[] }[] };
  return data.data[0]?.embedding ?? [];
}

export async function planWithLlm(
  query: string,
  chunks: ScoredChunk[],
  history?: { role: "user" | "assistant"; content: string }[],
  productId = "ctix",
  simpleMode = false
): Promise<AgentPlan> {
  const allowedSlugs = [...new Set(chunks.map((c) => c.slug))];
  const context = formatTrimmedContext(chunks, query, 8);
  const system = systemPromptForProduct(productId, simpleMode);

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
    throw new Error("LLM planning request failed.");
  }

  const data = (await res.json()) as {
    choices: { message: { content: string } }[];
  };
  const raw = data.choices[0]?.message?.content;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw ?? "{}");
  } catch {
    throw new Error("LLM returned an invalid JSON plan.");
  }

  const validated = validateLlmPlanPayload(parsed, new Set(allowedSlugs));
  const steps = [...validated.steps].sort((a, b) => a.order - b.order);

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
    workflow: validated.workflow,
    confidence: validated.confidence,
    steps,
    questions: validated.questions,
    citations,
  };
}

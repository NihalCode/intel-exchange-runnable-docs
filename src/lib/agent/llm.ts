import type { AgentPlan, ScoredChunk } from "./types";
import { formatChunksForPrompt } from "./planner";

const MODEL = "gpt-4o-mini";

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

export async function embedQuery(text: string, apiKey: string): Promise<number[]> {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "text-embedding-3-small",
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
  apiKey: string,
  history?: { role: "user" | "assistant"; content: string }[]
): Promise<AgentPlan> {
  const allowedSlugs = [...new Set(chunks.map((c) => c.slug))];
  const context = formatChunksForPrompt(chunks);

  const system = `You are a Cyware Intel Exchange API documentation assistant.
You MUST only recommend endpoints whose slug appears in the CONTEXT below.
Never invent endpoints, paths, or parameter names.
Return JSON with: workflow (markdown string), confidence (0-1), steps (array), questions (optional clarifying questions).
Each step must include: slug (exact from context), order (1-based), explanation, and optional pathParams/queryParams/body/form objects using ONLY documented parameter names.
If the request is ambiguous, set confidence below 0.5 and include questions.`;

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
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
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
        url: `/docs/${s.slug}`,
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

import type { StepParamOverrides } from "./types";

/**
 * Versioned, strict boundary for model-produced workflow plans. Keep this
 * separate from the public AgentResponse because the latter is assembled from
 * trusted documentation after this contract and endpoint validation succeed.
 */
export const LLM_PLAN_SCHEMA_VERSION = 1 as const;

const MAX_WORKFLOW_LENGTH = 12_000;
const MAX_EXPLANATION_LENGTH = 2_000;
const MAX_PARAM_STRING_LENGTH = 2_000;
const MAX_QUESTION_LENGTH = 500;
const MAX_STEPS = 12;
const MAX_QUESTIONS = 2;
const MAX_PARAMS_PER_SECTION = 30;
const MAX_BODY_DEPTH = 4;
const MAX_BODY_ARRAY_ITEMS = 20;
const MAX_BODY_OBJECT_KEYS = 30;

export interface ValidatedLlmPlan {
  workflow: string;
  confidence: number;
  steps: {
    slug: string;
    order: number;
    explanation: string;
    params?: StepParamOverrides;
  }[];
  questions?: string[];
}

export class LlmPlanContractError extends Error {
  readonly schemaVersion = LLM_PLAN_SCHEMA_VERSION;

  constructor() {
    super("LLM response did not match the expected plan schema.");
    this.name = "LlmPlanContractError";
  }
}

function fail(): never {
  throw new LlmPlanContractError();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function assertKnownKeys(value: Record<string, unknown>, allowed: readonly string[]): void {
  if (Object.keys(value).some((key) => !allowed.includes(key))) fail();
}

function stringValue(value: unknown, maxLength: number, required = false): string | undefined {
  if (value === undefined && !required) return undefined;
  if (typeof value !== "string" || value.length > maxLength) fail();
  return value;
}

function jsonValue(value: unknown, depth = 0): unknown {
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) fail();
    return value;
  }
  if (typeof value === "string") return stringValue(value, MAX_PARAM_STRING_LENGTH, true);
  if (depth >= MAX_BODY_DEPTH) fail();
  if (Array.isArray(value)) {
    if (value.length > MAX_BODY_ARRAY_ITEMS) fail();
    return value.map((item) => jsonValue(item, depth + 1));
  }
  if (!isRecord(value) || Object.keys(value).length > MAX_BODY_OBJECT_KEYS) fail();
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      stringValue(key, 200, true),
      jsonValue(item, depth + 1),
    ])
  );
}

function stringParams(value: unknown): Record<string, string> | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value) || Object.keys(value).length > MAX_PARAMS_PER_SECTION) fail();
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      stringValue(key, 200, true),
      stringValue(item, MAX_PARAM_STRING_LENGTH, true),
    ])
  );
}

function bodyParams(value: unknown): Record<string, unknown> | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value) || Object.keys(value).length > MAX_PARAMS_PER_SECTION) fail();
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      stringValue(key, 200, true),
      jsonValue(item),
    ])
  );
}

function stepParams(value: Record<string, unknown>): StepParamOverrides | undefined {
  const path = stringParams(value.pathParams);
  const query = stringParams(value.queryParams);
  const body = bodyParams(value.body);
  const form = stringParams(value.form);
  const params: StepParamOverrides = {};
  if (path) params.path = path;
  if (query) params.query = query;
  if (body) params.body = body;
  if (form) params.form = form;
  return Object.keys(params).length > 0 ? params : undefined;
}

/**
 * Parses a schema v1 model plan. Unknown fields are rejected at every
 * executable level so only bounded, documented data can reach the runner UI.
 */
export function validateLlmPlanPayload(raw: unknown, allowedSlugs: ReadonlySet<string>): ValidatedLlmPlan {
  if (!isRecord(raw)) fail();
  assertKnownKeys(raw, ["workflow", "confidence", "steps", "questions"]);

  const workflow =
    stringValue(raw.workflow, MAX_WORKFLOW_LENGTH) ??
    "Here is a suggested workflow using documented endpoints.";
  const confidence = raw.confidence ?? 0.5;
  if (typeof confidence !== "number" || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    fail();
  }
  if (raw.steps !== undefined && !Array.isArray(raw.steps)) fail();
  const sourceSteps = raw.steps ?? [];
  if (sourceSteps.length > MAX_STEPS) fail();

  const steps = sourceSteps.map((value) => {
    if (!isRecord(value)) fail();
    assertKnownKeys(value, ["slug", "order", "explanation", "pathParams", "queryParams", "body", "form"]);
    const slug = stringValue(value.slug, 200, true)!;
    if (!allowedSlugs.has(slug)) fail();
    const order: unknown = value.order ?? 1;
    if (
      typeof order !== "number" ||
      !Number.isInteger(order) ||
      order < 1 ||
      order > MAX_STEPS
    ) fail();
    const explanation = stringValue(value.explanation, MAX_EXPLANATION_LENGTH) ?? "";
    const params = stepParams(value);
    return { slug, order, explanation, params };
  });

  if (raw.questions !== undefined && !Array.isArray(raw.questions)) fail();
  const sourceQuestions = raw.questions as unknown[] | undefined;
  const questions = sourceQuestions?.map((value) => stringValue(value, MAX_QUESTION_LENGTH, true)!);
  if (questions && questions.length > MAX_QUESTIONS) fail();

  return { workflow, confidence, steps, questions: questions?.length ? questions : undefined };
}

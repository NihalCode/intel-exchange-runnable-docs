import type { EndpointPage, ParamField } from "../types";
import type { AgentPlan, AgentPlanStep, StepParamOverrides } from "./types";

const AUTH_QUERY = new Set(["accessid", "signature", "expires"]);

function bodyFieldNames(fields: ParamField[] | undefined, prefix = ""): Set<string> {
  const names = new Set<string>();
  if (!fields) return names;
  for (const f of fields) {
    if (!f.name) continue;
    const full = prefix ? `${prefix}.${f.name}` : f.name;
    names.add(full);
    names.add(f.name);
    if (f.complexItems?.length) {
      for (const n of bodyFieldNames(f.complexItems, full)) names.add(n);
    }
  }
  return names;
}

function allowedQuery(page: EndpointPage): Set<string> {
  const names = new Set(
    (page.request?.query ?? []).map((q) => q.name.toLowerCase()).filter(Boolean)
  );
  for (const a of AUTH_QUERY) names.add(a);
  return names;
}

function filterRecord(
  record: Record<string, string> | undefined,
  allowed: Set<string>,
  label: string,
  warnings: string[],
  slug: string
): Record<string, string> | undefined {
  if (!record) return undefined;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(record)) {
    if (allowed.has(k.toLowerCase())) {
      out[k] = String(v);
    } else {
      warnings.push(`Dropped unknown ${label} param "${k}" for ${slug}`);
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function filterBody(
  body: Record<string, unknown> | undefined,
  allowed: Set<string>,
  warnings: string[],
  slug: string
): Record<string, unknown> | undefined {
  if (!body) return undefined;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (allowed.has(k.toLowerCase())) {
      out[k] = v;
    } else {
      warnings.push(`Dropped unknown body field "${k}" for ${slug}`);
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export interface ValidatedPlanStep extends AgentPlanStep {
  title: string;
  method: EndpointPage["method"];
  path: string;
  docUrl: string;
  warnings: string[];
  params: StepParamOverrides;
}

export function validateStep(
  step: AgentPlanStep,
  page: EndpointPage,
  endpointSlugs: Set<string>
): ValidatedPlanStep | null {
  const warnings: string[] = [];

  if (!endpointSlugs.has(step.slug)) {
    warnings.push(`Unknown endpoint slug "${step.slug}"`);
    return null;
  }

  if (page.kind !== "endpoint") {
    warnings.push(`Slug "${step.slug}" is not an API endpoint`);
    return null;
  }

  const pathAllowed = new Set(
    (page.request?.path ?? []).map((p) => p.name.toLowerCase()).filter(Boolean)
  );
  const queryAllowed = allowedQuery(page);
  const bodyAllowed = bodyFieldNames(page.request?.body);
  const formAllowed = new Set(
    (page.request?.body ?? []).map((b) => b.name.toLowerCase()).filter(Boolean)
  );

  const params: StepParamOverrides = {};
  const path = filterRecord(step.params?.path, pathAllowed, "path", warnings, step.slug);
  const query = filterRecord(step.params?.query, queryAllowed, "query", warnings, step.slug);
  const body = filterBody(step.params?.body, bodyAllowed, warnings, step.slug);
  const form = filterRecord(step.params?.form, formAllowed, "form", warnings, step.slug);

  if (path) params.path = path;
  if (query) params.query = query;
  if (body) params.body = body;
  if (form) params.form = form;

  return {
    ...step,
    title: page.title,
    method: page.method,
    path: page.path,
    docUrl: `/docs/${step.slug}`,
    warnings,
    params,
  };
}

export function validatePlan(
  plan: AgentPlan,
  pages: Map<string, EndpointPage>,
  endpointSlugs: Set<string>
): { steps: ValidatedPlanStep[]; dropped: string[] } {
  const steps: ValidatedPlanStep[] = [];
  const dropped: string[] = [];

  for (const step of plan.steps) {
    const page = pages.get(step.slug);
    if (!page) {
      dropped.push(step.slug);
      continue;
    }
    const validated = validateStep(step, page, endpointSlugs);
    if (validated) {
      steps.push(validated);
    } else {
      dropped.push(step.slug);
    }
  }

  steps.sort((a, b) => a.order - b.order);
  return { steps, dropped };
}

/**
 * Keeps a model-suggested but undocumented endpoint from being presented as a
 * usable workflow. The caller should use this only when every proposed step was
 * rejected, rather than silently returning the model's prose.
 */
export function unsupportedEndpointAbstention(dropped: readonly string[]): string {
  const names = dropped.map((slug) => `\`${slug}\``).join(", ");
  return (
    `I can’t verify ${names} as a documented API endpoint, so I won’t suggest a request path. ` +
    "TODO: confirm the endpoint in the product API reference or provide the intended documented object type."
  );
}

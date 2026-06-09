import type { EndpointPage, ParamField, RunnableRequest } from "../types";
import type { StepEndpointSpec, StepPlaygroundMeta } from "./types";

function summarizeField(f: ParamField) {
  return {
    name: f.name,
    type: f.valueType || "string",
    required: !!f.isRequired,
    description: f.description?.trim() || undefined,
    example: f.value?.trim() || undefined,
  };
}

function responseExample(page: EndpointPage): StepEndpointSpec["expectedResponse"] | undefined {
  const ok =
    page.responses?.find((r) => r.statusCode && r.statusCode < 400) ||
    page.responses?.[0];
  if (!ok) return undefined;

  let example: string | undefined;
  if (ok.body?.length) {
    const obj: Record<string, unknown> = {};
    for (const f of ok.body) {
      if (f.name) obj[f.name] = f.value ?? null;
    }
    example = JSON.stringify(obj, null, 2);
  }

  return {
    statusCode: ok.statusCode ?? 200,
    description: ok.description?.trim() || undefined,
    example,
  };
}

export function buildStepPlaygroundMeta(page: EndpointPage): StepPlaygroundMeta {
  return {
    pathFields: page.request?.path,
    queryFields: page.request?.query,
    bodyFields: page.request?.body,
  };
}

export function buildStepSpec(
  page: EndpointPage,
  request: RunnableRequest,
  baseUrl: string
): StepEndpointSpec {
  const path = request.path.startsWith("/") ? request.path : `/${request.path}`;
  return {
    endpoint: `${baseUrl}${path}`,
    method: page.method,
    path,
    contentType: request.contentType || page.contentType || "application/json",
    multipart: !!request.multipart,
    auth: {
      type: "Intel Exchange Open API",
      description:
        "Every request requires AccessID, Signature, and Expires query parameters. " +
        "Signature is HMAC-SHA1 of `{AccessID}\\n{Expires}` using your Secret Key. " +
        "Credentials must stay server-side in production apps.",
      queryParams: ["AccessID", "Signature", "Expires"],
    },
    pathParameters: (page.request?.path ?? []).map(summarizeField),
    queryParameters: (page.request?.query ?? []).map(summarizeField),
    bodyParameters: (page.request?.body ?? []).map(summarizeField),
    headers: (page.request?.header ?? []).map(summarizeField),
    expectedResponse: responseExample(page),
  };
}

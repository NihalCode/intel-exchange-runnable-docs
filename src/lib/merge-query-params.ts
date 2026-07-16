import { isSensitiveName } from "@/lib/security";
import type { KeyValue, RequestQueryParam } from "@/lib/types";

const AUTH_QUERY_KEYS = new Set(["accessid", "signature", "expires"]);
const MAX_CUSTOM_PARAMS = 32;
const MAX_NAME_LENGTH = 128;
const MAX_VALUE_LENGTH = 4096;
const MAX_TOTAL_QUERY_LENGTH = 8192;

export interface CustomQueryParameter {
  id: string;
  name: string;
  value: string;
  enabled: boolean;
}

export interface MergeQueryParametersInput {
  documented: RequestQueryParam[];
  embedded?: RequestQueryParam[];
  auth?: RequestQueryParam[];
  custom?: CustomQueryParameter[];
  valueOverrides?: Record<string, string>;
}

export class QueryParamMergeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QueryParamMergeError";
  }
}

function validateCustomParam(name: string, value: string): void {
  const n = name.trim();
  if (!n) throw new QueryParamMergeError("Custom query parameter name is required.");
  if (n.length > MAX_NAME_LENGTH) throw new QueryParamMergeError("Custom query parameter name is too long.");
  if (/[\r\n\x00-\x1f]/.test(n) || /[\r\n\x00-\x1f]/.test(value)) {
    throw new QueryParamMergeError("Control characters are not allowed in query parameters.");
  }
  if (value.length > MAX_VALUE_LENGTH) {
    throw new QueryParamMergeError("Custom query parameter value is too long.");
  }
  if (AUTH_QUERY_KEYS.has(n.toLowerCase()) || isSensitiveName(n)) {
    throw new QueryParamMergeError(`Reserved query parameter name: ${n}`);
  }
}

function withOverride(param: RequestQueryParam, overrides?: Record<string, string>): RequestQueryParam {
  if (!overrides || !Object.prototype.hasOwnProperty.call(overrides, param.name)) return param;
  return { ...param, value: overrides[param.name] ?? param.value };
}

export function mergeQueryParameters(input: MergeQueryParametersInput): RequestQueryParam[] {
  const customEnabled = (input.custom ?? []).filter((c) => c.enabled && c.name.trim());
  if (customEnabled.length > MAX_CUSTOM_PARAMS) {
    throw new QueryParamMergeError(`At most ${MAX_CUSTOM_PARAMS} custom query parameters are allowed.`);
  }

  const documentedNames = new Set<string>();
  const merged: RequestQueryParam[] = [];

  for (const param of input.documented) {
    const next = withOverride(param, input.valueOverrides);
    documentedNames.add(next.name.toLowerCase());
    if (next.required && !(next.value ?? "").trim()) {
      merged.push(next);
      continue;
    }
    if (!(next.value ?? "").trim() && !next.required) continue;
    merged.push(next);
  }

  for (const param of input.embedded ?? []) {
    const key = param.name.toLowerCase();
    if (documentedNames.has(key)) continue;
    const next = withOverride(param, input.valueOverrides);
    if (!(next.value ?? "").trim()) continue;
    merged.push({ ...next, source: next.source ?? "embedded" });
  }

  const customNames = new Set<string>();
  for (const custom of customEnabled) {
    validateCustomParam(custom.name, custom.value);
    const key = custom.name.toLowerCase();
    if (documentedNames.has(key) || customNames.has(key)) {
      throw new QueryParamMergeError(`Duplicate custom query parameter: ${custom.name}`);
    }
    customNames.add(key);
    merged.push({ name: custom.name.trim(), value: custom.value, source: "custom" });
  }

  for (const param of input.auth ?? []) {
    if (AUTH_QUERY_KEYS.has(param.name.toLowerCase())) {
      merged.push({ ...param, source: "auth", sensitive: true });
    }
  }

  const qs = merged.map((p) => `${p.name}=${p.value}`).join("&");
  if (qs.length > MAX_TOTAL_QUERY_LENGTH) {
    throw new QueryParamMergeError("Combined query string exceeds the maximum length.");
  }

  return merged;
}

export function toKeyValuePairs(params: RequestQueryParam[]): KeyValue[] {
  return params.map((p) => ({ name: p.name, value: p.value }));
}

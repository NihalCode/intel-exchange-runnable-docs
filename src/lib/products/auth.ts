import { getProductOrThrow } from "./registry";
import type { AuthConfig, AuthType } from "./types";
import type { KeyValue } from "../types";
import { DISPLAY_BASE } from "../constants";

/** Build auth query params / headers for runnable snippets. */
export function authKeyValues(productId: string): {
  query: KeyValue[];
  headers: KeyValue[];
} {
  const product = getProductOrThrow(productId);
  const auth = product.auth;
  const query: KeyValue[] = (auth.queryParams ?? []).map((p) => ({
    name: p.name,
    value: `<${p.placeholder.toLowerCase().replace(/_/g, " ")}>`,
  }));
  const headers: KeyValue[] = (auth.headers ?? []).map((h) => ({
    name: h.name,
    value: h.placeholder,
  }));
  return { query, headers };
}

export function usesOpenApiQueryAuth(authType: AuthType): boolean {
  return authType === "ctix-open-api" || authType === "orchestrate-open-api";
}

export function getAuthConfig(productId: string): AuthConfig {
  return getProductOrThrow(productId).auth;
}

export function baseUrlForProduct(productId: string): string {
  if (productId === "ctix") return DISPLAY_BASE;
  const product = getProductOrThrow(productId);
  if (!product.baseApiUrl.includes("YOUR_TENANT")) return product.baseApiUrl.replace(/\/+$/, "");
  return product.baseApiUrl.replace("YOUR_TENANT", "tenantname").replace(/\/+$/, "");
}

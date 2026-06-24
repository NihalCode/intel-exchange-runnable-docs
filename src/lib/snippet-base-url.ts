import { DISPLAY_BASE, DISPLAY_BASE_RE } from "./constants";
import { baseUrlForProduct } from "./products/auth";
import { listProducts } from "./products/registry";

/** All placeholder tenant base URLs baked into generated snippets. */
export function productTemplateBaseUrls(): string[] {
  const fromRegistry = listProducts().map((p) => baseUrlForProduct(p.productId));
  const legacy = [
    DISPLAY_BASE,
    "https://tenantname.com/ctixapi",
    "https://tenantname.com/csap",
    "https://tenantname.com/co",
    "https://tenantname.com/cftrapi",
    "https://tenantname.cyware.com/ctixapi",
    "https://tenantname.cyware.com/csap",
    "https://tenantname.cyware.com/co",
    "https://tenantname.cyware.com/cftrapi",
  ];
  return [...new Set([...fromRegistry, ...legacy].map((u) => u.replace(/\/+$/, "")))];
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Replace any product template base URL in snippet text with the user's configured base URL. */
export function applyRuntimeBaseUrl(code: string, baseUrl: string): string {
  const normalized = (baseUrl || "").replace(/\/+$/, "");
  if (!normalized) return code;

  let out = code.replace(DISPLAY_BASE_RE, normalized);
  for (const template of productTemplateBaseUrls()) {
    const re = new RegExp(escapeRegExp(template), "g");
    out = out.replace(re, normalized);
  }
  return out;
}

/** Swap a full request URL from a baked-in template base to the runtime base URL. */
export function rewriteUrlWithRuntimeBase(url: string, baseUrl: string): string {
  const normalized = (baseUrl || "").replace(/\/+$/, "");
  if (!normalized) return url;

  for (const template of productTemplateBaseUrls()) {
    const t = template.replace(/\/+$/, "");
    if (url.startsWith(t)) {
      return normalized + url.slice(t.length);
    }
  }
  return url;
}

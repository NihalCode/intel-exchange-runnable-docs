import { getAppBaseUrl } from "@/lib/documentation-auth/env";
import {
  configuredProductHostnames,
  getStaticDomainConfig,
} from "@/lib/domains/env-config";
import { normalizeHostname } from "@/lib/domains/normalize";
import { isProductKey, type ProductKey } from "@/lib/products/registry";

function originForHostname(hostname: string): string {
  const normalized = normalizeHostname(hostname, { allowPrivateHosts: true });
  const host = normalized.ok ? normalized.hostname : hostname.trim().toLowerCase();
  return `https://${host}`;
}

/** Canonical HTTPS origin for a product domain, or null when unset. */
export function productOriginUrl(productId: ProductKey): string | null {
  const hostnames = configuredProductHostnames();
  const hostname = hostnames[productId];
  return hostname ? originForHostname(hostname) : null;
}

/** Admin control-plane origin from ADMIN_DOMAIN, falling back to APP_BASE_URL. */
export function adminOriginUrl(): string {
  const config = getStaticDomainConfig();
  if (config.admin) return originForHostname(config.admin);
  return getAppBaseUrl();
}

/** Optional central auth origin from AUTH_DOMAIN. */
export function authOriginUrl(): string | null {
  const config = getStaticDomainConfig();
  return config.auth ? originForHostname(config.auth) : null;
}

/** Builds a docs path on the configured product origin, or shared /docs/{product} fallback. */
export function docsUrlOnProductDomain(
  productId: ProductKey,
  path = "/docs"
): string {
  const origin = productOriginUrl(productId);
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  if (origin) return `${origin}${normalizedPath}`;
  return `${getAppBaseUrl()}/docs/${productId}${normalizedPath === "/docs" ? "" : normalizedPath.replace(/^\/docs/, "")}`;
}

/** Admin dashboard URL on the admin origin (external /admin path preserved for rewrites). */
export function adminDashboardUrl(path = "/admin"): string {
  const origin = adminOriginUrl();
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${origin}${normalizedPath}`;
}

/** Sign-in URL on the auth origin when configured, otherwise the primary app origin. */
export function authSignInUrl(returnTo?: string): string {
  const origin = authOriginUrl() ?? getAppBaseUrl();
  const url = new URL("/sign-in", origin);
  if (returnTo) url.searchParams.set("returnTo", returnTo);
  return url.toString();
}

export function hostnameForProduct(productId: string): string | null {
  if (!isProductKey(productId)) return null;
  return configuredProductHostnames()[productId] ?? null;
}

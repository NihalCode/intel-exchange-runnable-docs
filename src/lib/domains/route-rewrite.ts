import { isProductKey } from "@/lib/products/registry";
import type { ResolvedHostContext } from "@/lib/domains/types";

const PRODUCT_ROUTE_PREFIX = /^\/docs\/([^/]+)(\/|$)/;

/**
 * On a dedicated product host, rewrite clean `/docs` paths to `/docs/{productId}`.
 * Returns null when no rewrite is needed.
 */
export function productHostDocsRewrite(
  pathname: string,
  hostContext: ResolvedHostContext
): string | null {
  if (hostContext.domainKind !== "product" || !hostContext.productId) return null;

  const productId = hostContext.productId;

  if (pathname === "/docs" || pathname === "/docs/") {
    return `/docs/${productId}`;
  }

  const match = pathname.match(PRODUCT_ROUTE_PREFIX);
  if (match && match[1] !== productId) {
    return "__CROSS_PRODUCT_MISMATCH__";
  }

  if (pathname.startsWith("/docs/") && !match) {
    const slug = pathname.slice("/docs/".length);
    if (slug && !slug.includes("/")) {
      return `/docs/${productId}/${slug}`;
    }
  }

  return null;
}

/** Admin paths on product hosts should not render locally. */
export function isAdminPathOnProductHost(pathname: string): boolean {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

export function isProductContentPath(pathname: string): boolean {
  return (
    pathname.startsWith("/docs") ||
    pathname.startsWith("/guides") ||
    pathname.startsWith("/changelog") ||
    pathname.startsWith("/agent") ||
    pathname.startsWith("/authentication")
  );
}

export function crossProductPathMismatch(
  pathname: string,
  hostContext: ResolvedHostContext
): boolean {
  if (hostContext.domainKind !== "product" || !hostContext.productId) return false;
  const match = pathname.match(PRODUCT_ROUTE_PREFIX);
  if (!match) return false;
  const segment = match[1]!;
  return isProductKey(segment) && segment !== hostContext.productId;
}

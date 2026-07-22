export interface DocsSearchHitLike {
  title: string;
  slug?: string;
  href?: string;
  productId?: string;
}

/** Resolve a documentation search hit to a navigable docs URL. */
export function docsSearchResultHref(hit: DocsSearchHitLike): string {
  if (hit.href) return hit.href;
  const product = hit.productId || "ctix";
  const slug = (hit.slug || "").replace(/^\/+/, "");
  if (!slug) return `/docs/${product}`;
  // CTIX legacy routes may omit product prefix in [...slug]
  if (product === "ctix" && !slug.includes("/")) {
    return `/docs/${slug}`;
  }
  if (slug.startsWith(`${product}/`)) return `/docs/${slug}`;
  return `/docs/${product}/${slug}`;
}

import { DEFAULT_PRODUCT_ID, isProductKey, type ProductKey } from "@/lib/products/registry";

/**
 * When set, this Vercel project serves a single product only (multi-project topology).
 * Env name: APP_PRODUCT_ID
 */
export function resolveAppProductId(): ProductKey | null {
  const raw = process.env.APP_PRODUCT_ID?.trim();
  if (raw && isProductKey(raw)) return raw;
  return null;
}

/** Effective product for this deployment — pinned or default. */
export function effectiveDeploymentProductId(): ProductKey {
  return resolveAppProductId() ?? (isProductKey(DEFAULT_PRODUCT_ID) ? DEFAULT_PRODUCT_ID : "ctix");
}

export function isSingleProductDeployment(): boolean {
  return resolveAppProductId() !== null;
}

/** True on per-product Vercel projects (pinned product, Vercel token, or explicit flag). */
export function isMultiProjectDeployment(): boolean {
  if (isSingleProductDeployment()) return true;
  if (process.env.VERCEL_TOKEN?.trim()) return true;
  return process.env.MULTI_PROJECT_DEPLOYMENT === "true";
}

export function assertProductAccess(requestedProduct: string): ProductKey {
  const pinned = resolveAppProductId();
  if (pinned && requestedProduct !== pinned && requestedProduct !== "all") {
    throw new Error(`Product ${requestedProduct} is not served by this deployment`);
  }
  if (!isProductKey(requestedProduct)) {
    throw new Error(`Invalid product: ${requestedProduct}`);
  }
  return requestedProduct;
}

/**
 * Ask AI on a pinned deployment always answers for the host product.
 * Coerce instead of 403 so a stale client productId (or multi-credential UI)
 * cannot false-trigger "Product not available on this deployment".
 */
export function coerceAgentProductId(requestedProduct: string | undefined | null): ProductKey {
  const pinned = resolveAppProductId();
  if (pinned) return pinned;
  const raw = typeof requestedProduct === "string" ? requestedProduct.trim() : "";
  if (!raw || raw === "all") {
    return effectiveDeploymentProductId();
  }
  if (!isProductKey(raw)) {
    throw new Error(`Invalid product: ${raw}`);
  }
  return raw;
}

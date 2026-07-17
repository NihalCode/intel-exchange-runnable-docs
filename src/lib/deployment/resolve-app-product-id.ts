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

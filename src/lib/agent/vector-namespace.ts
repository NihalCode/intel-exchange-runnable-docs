import "server-only";

import { resolveAppProductId } from "@/lib/deployment/resolve-app-product-id";
import type { ProductKey } from "@/lib/products/registry";

/**
 * Pinecone namespace for hard isolation between product deployments.
 * When VECTOR_NAMESPACE is set it wins; otherwise APP_PRODUCT_ID maps to `product-{id}`.
 */
export function resolveVectorNamespace(productId?: ProductKey | null): string | undefined {
  const explicit = process.env.VECTOR_NAMESPACE?.trim();
  if (explicit) return explicit;

  const pinned = resolveAppProductId();
  if (pinned) return `product-${pinned}`;

  if (productId) return `product-${productId}`;
  return undefined;
}

/** Throws when a pinned deploy would query outside its namespace. */
export function assertVectorNamespaceAccess(requestedProductId?: ProductKey | null): string | undefined {
  const namespace = resolveVectorNamespace(requestedProductId);
  const pinned = resolveAppProductId();
  if (pinned && requestedProductId && requestedProductId !== pinned) {
    throw new Error(`Vector namespace isolation: deployment serves ${pinned} only`);
  }
  return namespace;
}

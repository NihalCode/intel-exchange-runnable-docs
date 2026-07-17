import type { ProductKey } from "@/lib/products/registry";
import { getProduct } from "@/lib/products/registry";

/** Approved Postman/docs collection identifiers per product (not from browser input). */
export function approvedCollectionIdForProduct(product: ProductKey): string {
  const meta = getProduct(product);
  if (!meta) throw new Error(`Unknown product: ${product}`);
  if (product === "cftr") return "4787352";
  return meta.docsProject ?? product;
}

export function validateCollectionForProduct(
  product: ProductKey,
  collectionId: string
): boolean {
  return approvedCollectionIdForProduct(product) === collectionId.trim();
}

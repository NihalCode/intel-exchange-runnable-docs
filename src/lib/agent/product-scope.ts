import {
  ALL_PRODUCTS_ID,
  DEFAULT_PRODUCT_ID,
  getProductOrThrow,
  inferProductFromQuery,
  inferProductsFromQuery,
  listProducts,
} from "../products/registry";
import type { AgentRequest } from "./types";

export type ProductScopeSource = "query" | "dropdown" | "all";

export interface ResolvedProductScope {
  /** Primary product for planning and codegen. */
  primaryProductId: string;
  /** Products to retrieve against (may be multiple). */
  productIds: string[];
  /** Filter mode for retrieval. */
  filterMode: "single" | "multi" | "all";
  source: ProductScopeSource;
  /** UI label, e.g. "Using: CSAP, based on your question". */
  label: string;
  /** Structured product list for response metadata. */
  products: { id: string; label: string }[];
}

/**
 * Resolve which product's docs to retrieve and plan against.
 * Explicit product mentions in the query beat the UI product selector.
 * Multiple mentions → multi-product retrieval.
 */
export function resolveProductScope(req: AgentRequest, query: string): ResolvedProductScope {
  const mentioned = inferProductsFromQuery(query);
  const dropdownId = req.productId && req.productId !== ALL_PRODUCTS_ID ? req.productId : DEFAULT_PRODUCT_ID;

  if (mentioned.length === 1 && mentioned[0] === ALL_PRODUCTS_ID) {
    return {
      primaryProductId: DEFAULT_PRODUCT_ID,
      productIds: listProducts().map((p) => p.productId),
      filterMode: "all",
      source: "all",
      label: "Using: all Cyware APIs",
      products: listProducts().map((p) => ({ id: p.productId, label: p.displayLabel })),
    };
  }

  if (mentioned.length > 1) {
    const products = mentioned.map((id) => ({
      id,
      label: getProductOrThrow(id).displayLabel,
    }));
    return {
      primaryProductId: mentioned[0]!,
      productIds: mentioned,
      filterMode: "multi",
      source: "query",
      label: `Using: ${products.map((p) => p.label).join(", ")}, based on your question`,
      products,
    };
  }

  if (mentioned.length === 1) {
    const p = getProductOrThrow(mentioned[0]!);
    return {
      primaryProductId: mentioned[0]!,
      productIds: [mentioned[0]!],
      filterMode: "single",
      source: "query",
      label: `Using: ${p.displayLabel}, based on your question`,
      products: [{ id: p.productId, label: p.displayLabel }],
    };
  }

  if (req.productId === ALL_PRODUCTS_ID) {
    return {
      primaryProductId: DEFAULT_PRODUCT_ID,
      productIds: listProducts().map((p) => p.productId),
      filterMode: "all",
      source: "all",
      label: "Using: all Cyware APIs (search scope)",
      products: listProducts().map((p) => ({ id: p.productId, label: p.displayLabel })),
    };
  }

  const p = getProductOrThrow(dropdownId);
  return {
    primaryProductId: dropdownId,
    productIds: [dropdownId],
    filterMode: "single",
    source: "dropdown",
    label: `Using: ${p.displayLabel} from the selected product dropdown`,
    products: [{ id: p.productId, label: p.displayLabel }],
  };
}

/** @deprecated Use resolveProductScope — returns primary product id string. */
export function resolveProductScopeId(req: AgentRequest, query: string): string {
  const scope = resolveProductScope(req, query);
  if (scope.filterMode === "all") return ALL_PRODUCTS_ID;
  if (scope.filterMode === "multi") return scope.primaryProductId;
  return scope.primaryProductId;
}

export function productScopeForFilter(scope: ResolvedProductScope): string {
  if (scope.filterMode === "all") return ALL_PRODUCTS_ID;
  if (scope.filterMode === "multi") return ALL_PRODUCTS_ID;
  return scope.primaryProductId;
}

/** Re-export for callers that only need single inference. */
export { inferProductFromQuery, inferProductsFromQuery };

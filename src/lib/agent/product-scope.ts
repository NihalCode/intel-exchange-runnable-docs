import {
  ALL_PRODUCTS_ID,
  DEFAULT_PRODUCT_ID,
  getProductOrThrow,
  inferProductsFromQuery,
  listProducts,
} from "../products/registry";
import type { AgentRequest } from "./types";

export type ProductScopeSource = "query" | "dropdown" | "all";

export interface ProductScopeAccessViolation {
  deniedProductIds: string[];
  allowedProductIds: string[];
}

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
  /** Set when the user asked for a product they have not connected. */
  accessViolation?: ProductScopeAccessViolation;
}

export interface ProductScopeOptions {
  /** When set, agent retrieval and planning are limited to these product IDs. */
  allowedProductIds?: readonly string[];
}

function catalogProducts(allowedProductIds?: readonly string[]) {
  const all = listProducts();
  if (!allowedProductIds?.length) return all;
  const allowed = new Set(allowedProductIds);
  return all.filter((product) => allowed.has(product.productId));
}

function productEntries(ids: string[]) {
  return ids.map((id) => ({
    id,
    label: getProductOrThrow(id).displayLabel,
  }));
}

function deniedProducts(
  productIds: string[],
  allowedSet: Set<string> | null
): string[] {
  if (!allowedSet) return [];
  return productIds.filter(
    (id) => id !== ALL_PRODUCTS_ID && !allowedSet.has(id)
  );
}

function accessViolationScope(
  deniedProductIds: string[],
  allowedProductIds: string[]
): ResolvedProductScope {
  const allowed = allowedProductIds.length ? allowedProductIds : [DEFAULT_PRODUCT_ID];
  return {
    primaryProductId: allowed[0]!,
    productIds: [],
    filterMode: "single",
    source: "query",
    label: "",
    products: [],
    accessViolation: {
      deniedProductIds,
      allowedProductIds: allowed,
    },
  };
}

function scopeFromProductIds(
  productIds: string[],
  source: ProductScopeSource,
  label: string
): ResolvedProductScope {
  const unique = [...new Set(productIds)];
  const filterMode =
    unique.length > 1 ? ("multi" as const) : ("single" as const);
  return {
    primaryProductId: unique[0] ?? DEFAULT_PRODUCT_ID,
    productIds: unique,
    filterMode,
    source,
    label,
    products: productEntries(unique),
  };
}

/**
 * Resolve which product's docs to retrieve and plan against.
 * Explicit product mentions in the query beat the UI product selector.
 * Multiple mentions → multi-product retrieval.
 */
export function resolveProductScope(
  req: AgentRequest,
  query: string,
  options?: ProductScopeOptions
): ResolvedProductScope {
  const allowedProductIds = options?.allowedProductIds;
  const allowedSet =
    allowedProductIds && allowedProductIds.length > 0
      ? new Set(allowedProductIds)
      : null;
  const catalog = catalogProducts(allowedProductIds);
  const catalogIds = catalog.map((product) => product.productId);
  const defaultProductId = catalogIds[0] ?? DEFAULT_PRODUCT_ID;

  const mentioned = inferProductsFromQuery(query);
  const mentionedReal = mentioned.filter((id) => id !== ALL_PRODUCTS_ID);
  const deniedFromQuery = deniedProducts(mentionedReal, allowedSet);
  if (deniedFromQuery.length > 0) {
    return accessViolationScope(deniedFromQuery, catalogIds);
  }

  if (mentioned.length === 1 && mentioned[0] === ALL_PRODUCTS_ID) {
    const ids = catalogIds.length ? catalogIds : [DEFAULT_PRODUCT_ID];
    return {
      primaryProductId: ids[0]!,
      productIds: ids,
      filterMode: ids.length > 1 ? "multi" : "single",
      source: "all",
      label:
        ids.length > 1
          ? `Using: ${productEntries(ids)
              .map((product) => product.label)
              .join(", ")}`
          : `Using: ${getProductOrThrow(ids[0]!).displayLabel}`,
      products: productEntries(ids),
    };
  }

  if (mentioned.length > 1) {
    const products = productEntries(mentioned);
    return {
      primaryProductId: mentioned[0]!,
      productIds: mentioned,
      filterMode: "multi",
      source: "query",
      label: `Using: ${products.map((product) => product.label).join(", ")}, based on your question`,
      products,
    };
  }

  if (mentioned.length === 1) {
    const product = getProductOrThrow(mentioned[0]!);
    return {
      primaryProductId: mentioned[0]!,
      productIds: [mentioned[0]!],
      filterMode: "single",
      source: "query",
      label: `Using: ${product.displayLabel}, based on your question`,
      products: [{ id: product.productId, label: product.displayLabel }],
    };
  }

  const dropdownId =
    req.productId && req.productId !== ALL_PRODUCTS_ID
      ? req.productId
      : defaultProductId;
  const deniedDropdown = deniedProducts([dropdownId], allowedSet);
  if (deniedDropdown.length > 0) {
    return accessViolationScope(deniedDropdown, catalogIds);
  }

  if (req.productId === ALL_PRODUCTS_ID) {
    const ids = catalogIds.length ? catalogIds : [DEFAULT_PRODUCT_ID];
    return {
      primaryProductId: ids[0]!,
      productIds: ids,
      filterMode: ids.length > 1 ? "multi" : "single",
      source: "all",
      label:
        ids.length > 1
          ? "Using: all connected Cyware APIs (search scope)"
          : `Using: ${getProductOrThrow(ids[0]!).displayLabel} from the selected product dropdown`,
      products: productEntries(ids),
    };
  }

  const product = getProductOrThrow(dropdownId);
  return {
    primaryProductId: dropdownId,
    productIds: [dropdownId],
    filterMode: "single",
    source: "dropdown",
    label: `Using: ${product.displayLabel} from the selected product dropdown`,
    products: [{ id: product.productId, label: product.displayLabel }],
  };
}

/** @deprecated Use resolveProductScope — returns primary product id string. */
export function resolveProductScopeId(req: AgentRequest, query: string): string {
  const scope = resolveProductScope(req, query);
  if (scope.accessViolation) return scope.primaryProductId;
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
export { inferProductsFromQuery } from "../products/registry";

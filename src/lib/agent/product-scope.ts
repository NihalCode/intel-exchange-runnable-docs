import {
  ALL_PRODUCTS_ID,
  DEFAULT_PRODUCT_ID,
  inferProductFromQuery,
} from "../products/registry";
import type { AgentRequest } from "./types";

/**
 * Resolve which product's docs to retrieve and plan against.
 * Explicit product mentions in the query beat the UI product selector.
 */
export function resolveProductScope(req: AgentRequest, query: string): string {
  const inferred = inferProductFromQuery(query);

  if (inferred === ALL_PRODUCTS_ID) return ALL_PRODUCTS_ID;
  if (inferred && inferred !== ALL_PRODUCTS_ID) return inferred;

  if (req.productId && req.productId !== ALL_PRODUCTS_ID) return req.productId;
  if (req.productId === ALL_PRODUCTS_ID) return ALL_PRODUCTS_ID;

  return DEFAULT_PRODUCT_ID;
}

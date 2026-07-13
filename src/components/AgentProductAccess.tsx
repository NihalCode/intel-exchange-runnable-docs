"use client";

import { createContext, useContext } from "react";

const AgentProductAccessContext = createContext<readonly string[]>([]);

export function AgentProductAccessProvider({
  credentialedProducts,
  children,
}: {
  credentialedProducts: readonly string[];
  children: React.ReactNode;
}) {
  return (
    <AgentProductAccessContext.Provider value={credentialedProducts}>
      {children}
    </AgentProductAccessContext.Provider>
  );
}

export function useAgentProductAccess(): readonly string[] {
  return useContext(AgentProductAccessContext);
}

export function clampAgentProductId(
  productId: string,
  allowedProductIds: readonly string[]
): string {
  if (!allowedProductIds.length) return productId;
  if (allowedProductIds.length === 1) return allowedProductIds[0]!;
  if (productId === "all") return "all";
  if (allowedProductIds.includes(productId)) return productId;
  return "all";
}

export function quickStartsForProducts(
  prompts: readonly string[],
  allowedProductIds: readonly string[],
  inferProducts: (query: string) => string[]
): string[] {
  if (!allowedProductIds.length) return [...prompts];
  return prompts.filter((prompt) => {
    const mentioned = inferProducts(prompt).filter((id) => id !== "all");
    if (mentioned.length === 0) return true;
    return mentioned.every((id) => allowedProductIds.includes(id));
  });
}

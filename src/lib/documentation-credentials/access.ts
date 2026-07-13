import "server-only";

import type { AgentMode, AgentResponse } from "@/lib/agent/types";
import { getProductOrThrow } from "@/lib/products/registry";

import { listValidCredentialProductIds } from "@/lib/documentation-credentials/repository";
import type { DocumentationProduct } from "@/lib/documentation-credentials/types";

export async function getAgentProductAccess(
  organizationId: string,
  userId: string
): Promise<{
  productIds: DocumentationProduct[];
  hasAny: boolean;
  labels: string[];
}> {
  const productIds = await listValidCredentialProductIds(organizationId, userId);
  return {
    productIds,
    hasAny: productIds.length > 0,
    labels: productIds.map((id) => getProductOrThrow(id).displayLabel),
  };
}

export function buildProductAccessDeniedResponse(
  deniedProductIds: string[],
  allowedProductIds: string[],
  mode: AgentMode = "workflow"
): AgentResponse {
  const deniedLabels = deniedProductIds
    .map((id) => getProductOrThrow(id).displayLabel)
    .join(", ");
  const allowedLabels = allowedProductIds
    .map((id) => getProductOrThrow(id).displayLabel)
    .join(", ");

  return {
    mode,
    workflow:
      "The Documentation Agent can only answer for products you have connected at /authentication.\n\n" +
      `Not connected: ${deniedLabels}.\n` +
      `Connected: ${allowedLabels}.`,
    confidence: 0,
    fallback: true,
    citations: [],
    steps: [],
    code: "PRODUCT_NOT_AUTHORIZED",
    allowedProductIds,
    questions: [
      ...allowedProductIds.map(
        (id) => `Ask about ${getProductOrThrow(id).displayLabel}`
      ),
      "Connect another product at /authentication",
    ],
  };
}

export function buildProductClarificationQuestions(
  allowedProductIds: readonly string[]
): string[] {
  const questions = allowedProductIds.map((id) => {
    const label = getProductOrThrow(id).displayLabel;
    switch (id) {
      case "ctix":
        return `${label} — threat intelligence and STIX`;
      case "csap":
        return `${label} — situational awareness and collaboration`;
      case "orchestrate":
        return `${label} — playbooks and integrations`;
      case "cftr":
        return `${label} — case management and incidents`;
      default:
        return label;
    }
  });
  if (allowedProductIds.length > 1) {
    questions.push('Or say "search all connected Cyware APIs" for cross-product search.');
  }
  return questions;
}

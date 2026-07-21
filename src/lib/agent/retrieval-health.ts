import { resolveAppProductId } from "@/lib/deployment/resolve-app-product-id";
import { isOpenAiConfigured } from "@/lib/openai/client";
import { getPineconeConfig, isPineconeConfigured } from "@/lib/agent/pinecone";
import { resolveVectorNamespace } from "@/lib/agent/vector-namespace";
import type { RetrievalReasonCode } from "@/lib/agent/types";

export interface RetrievalHealthStatus {
  ready: boolean;
  openaiConfigured: boolean;
  pineconeConfigured: boolean;
  indexNameConfigured: boolean;
  indexName: string;
  namespace: string | null;
  appProductId: string | null;
  reasonCodes: RetrievalReasonCode[];
}

/**
 * Config-only retrieval health (no network, no secrets).
 * Use to diagnose degraded_lexical without exposing provider credentials.
 */
export function getRetrievalHealthStatus(): RetrievalHealthStatus {
  const openaiConfigured = isOpenAiConfigured();
  const pineconeConfigured = isPineconeConfigured();
  const indexName = process.env.PINECONE_INDEX?.trim() || "intel-exchange-docs";
  const indexNameConfigured = Boolean(process.env.PINECONE_INDEX?.trim());
  const appProductId = resolveAppProductId();
  const namespace = resolveVectorNamespace(appProductId) ?? null;

  const reasonCodes: RetrievalReasonCode[] = [];
  if (!openaiConfigured) reasonCodes.push("openai_not_configured");
  if (!pineconeConfigured) reasonCodes.push("pinecone_not_configured");

  const ready = openaiConfigured && pineconeConfigured;
  if (ready) reasonCodes.push("hybrid_ok");

  return {
    ready,
    openaiConfigured,
    pineconeConfigured,
    indexNameConfigured,
    indexName,
    namespace,
    appProductId,
    reasonCodes,
  };
}

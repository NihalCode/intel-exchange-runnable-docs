import { isAuthEnabled } from "@/lib/documentation-auth/config";
import { isDeveloperAccessConfigured } from "./access";
import { canRunProductIngest } from "./ingest-access";
import {
  developerCredentialSummary,
  missingDeveloperCredentials,
} from "./credential-env";
import { listProducts } from "../products/registry";
import { getOpenAiCredentialStatus, openAiDeveloperStatusLabel } from "../openai/credentials";

export interface DeveloperBlocker {
  id: string;
  severity: "info" | "warning" | "error";
  message: string;
  /** Blocks ingest / live validation when true */
  blocking: boolean;
}

export interface DeveloperDiagnostics {
  generatedAt: string;
  developerAccessConfigured: boolean;
  publicDocsMode: boolean;
  liveApiUiEnabled: boolean;
  openAiConfigured: boolean;
  openai: ReturnType<typeof getOpenAiCredentialStatus> & {
    developerStatusLabel: "Configured" | "Missing";
  };
  pineconeConfigured: boolean;
  products: {
    productId: string;
    productName: string;
    pageCount: number;
    indexed: boolean;
    developerCredentialsComplete: boolean;
  }[];
  credentialSummary: ReturnType<typeof developerCredentialSummary>;
  blockers: DeveloperBlocker[];
}

export function runDeveloperDiagnostics(): DeveloperDiagnostics {
  const blockers: DeveloperBlocker[] = [];
  const developerAccessConfigured = isDeveloperAccessConfigured();

  if (!isAuthEnabled()) {
    if (!developerAccessConfigured) {
      blockers.push({
        id: "missing-developer-token",
        severity: "error",
        message: "DEVELOPER_ACCESS_TOKEN is not set — Postman import and live validation are blocked.",
        blocking: true,
      });
    }

    const missing = missingDeveloperCredentials();
    if (missing.length > 0) {
      blockers.push({
        id: "missing-dev-credentials",
        severity: "warning",
        message: `Missing server-side developer credentials: ${missing.join(", ")}`,
        blocking: true,
      });
    }
  }

  if (!process.env.OPENAI_API_KEY?.trim()) {
    blockers.push({
      id: "missing-openai",
      severity: "warning",
      message:
        "OPENAI_API_KEY is unset — add it to .env.local or deployment environment variables. Agent LLM planning and app edits use rule-based fallback until configured.",
      blocking: false,
    });
  }

  if (!process.env.PINECONE_API_KEY?.trim()) {
    blockers.push({
      id: "missing-pinecone",
      severity: "info",
      message: "PINECONE_API_KEY is unset — agent uses local BM25 index (expected for offline dev).",
      blocking: false,
    });
  }

  const liveApiUiEnabled = process.env.NEXT_PUBLIC_ENABLE_LIVE_API_UI === "true";
  if (!liveApiUiEnabled) {
    blockers.push({
      id: "public-docs-mode",
      severity: "info",
      message:
        "Public documentation mode is active (NEXT_PUBLIC_ENABLE_LIVE_API_UI is not true). Clients see docs and placeholders only.",
      blocking: false,
    });
  }

  const credentialSummary = developerCredentialSummary();
  const openai = {
    ...getOpenAiCredentialStatus(),
    developerStatusLabel: openAiDeveloperStatusLabel(),
  };

  return {
    generatedAt: new Date().toISOString(),
    developerAccessConfigured,
    publicDocsMode: !liveApiUiEnabled,
    liveApiUiEnabled,
    openAiConfigured: openai.configured,
    openai,
    pineconeConfigured: Boolean(process.env.PINECONE_API_KEY?.trim()),
    products: listProducts().map((p) => ({
      productId: p.productId,
      productName: p.productName,
      pageCount: p.pageCount ?? 0,
      indexed: p.indexed,
      developerCredentialsComplete:
        credentialSummary.find((c) => c.productId === p.productId)?.complete ?? false,
    })),
    credentialSummary,
    blockers,
  };
}

/** @deprecated Prefer canRunProductIngest from ingest-access.ts */
export function canRunDeveloperIngest(productId: string): { allowed: boolean; blockers: string[] } {
  return canRunProductIngest(productId);
}

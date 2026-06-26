import { isOpenAiConfigured } from "./client";

const REQUIRED_FOR = [
  "chat",
  "agent",
  "semantic-search",
  "embeddings",
  "investigations",
  "app-edits",
] as const;

export type OpenAiCredentialStatus = {
  configured: boolean;
  visibleToClient: false;
  requiredFor: readonly string[];
  message?: string;
};

/** Safe to return from public API routes — never includes the key or a preview. */
export function getOpenAiCredentialStatus(): OpenAiCredentialStatus {
  const configured = isOpenAiConfigured();
  if (configured) {
    return {
      configured: true,
      visibleToClient: false,
      requiredFor: REQUIRED_FOR,
    };
  }
  return {
    configured: false,
    visibleToClient: false,
    requiredFor: REQUIRED_FOR,
    message:
      "OPENAI_API_KEY is missing. Add it to .env.local or deployment environment variables.",
  };
}

/** Developer diagnostics — status label only, never the key value. */
export function openAiDeveloperStatusLabel(): "Configured" | "Missing" {
  return isOpenAiConfigured() ? "Configured" : "Missing";
}

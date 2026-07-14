/** Thrown when OPENAI_API_KEY is unset and a feature requires it. */
export class OpenAiNotConfiguredError extends Error {
  readonly code = "OPENAI_NOT_CONFIGURED" as const;

  readonly developerMessage =
    "OpenAI API key is missing. Add OPENAI_API_KEY to .env.local for local development or to your deployment environment variables.";

  readonly clientMessage =
    "The AI Agent is not configured yet. Please contact the workspace administrator.";

  constructor() {
    super("OPENAI_API_KEY is not configured");
    this.name = "OpenAiNotConfiguredError";
  }
}

export function isOpenAiConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

/**
 * Provider responses can include request payloads, model identifiers, and
 * diagnostic details. Keep those server-side and return a stable user message.
 */
export function sanitizeProviderError(error: unknown, fallback = "The AI service is unavailable."): string {
  if (error instanceof OpenAiNotConfiguredError) return error.clientMessage;
  const message = error instanceof Error ? error.message : "";
  if (/openai|embedding|llm plan|api\.openai\.com|provider/i.test(message)) {
    return "The AI service is temporarily unavailable. Please try again later.";
  }
  return fallback;
}

/** Server-side only — never return this value to the client. */
export function requireOpenAiApiKey(): string {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new OpenAiNotConfiguredError();
  }
  return apiKey;
}

export function openAiChatModel(): string {
  return process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
}

export function openAiEmbeddingModel(): string {
  return process.env.OPENAI_EMBEDDING_MODEL?.trim() || "text-embedding-3-small";
}

/** Headers for OpenAI REST calls — use only in server-side code. */
export function openAiAuthHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${requireOpenAiApiKey()}`,
    "Content-Type": "application/json",
  };
}

/**
 * Server-side OpenAI access. Uses fetch (no browser bundle) and env-based auth.
 * Call only from server routes and `server-only` modules.
 */
export function getOpenAIClient() {
  return {
    chatModel: openAiChatModel(),
    embeddingModel: openAiEmbeddingModel(),
    authHeaders: openAiAuthHeaders,
    requireApiKey: requireOpenAiApiKey,
    configured: isOpenAiConfigured(),
  };
}

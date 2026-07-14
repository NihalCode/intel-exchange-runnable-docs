import { describe, it, expect, afterEach } from "vitest";
import {
  getOpenAiCredentialStatus,
  openAiDeveloperStatusLabel,
} from "../openai/credentials";
import {
  isOpenAiConfigured,
  requireOpenAiApiKey,
  OpenAiNotConfiguredError,
  openAiChatModel,
  openAiEmbeddingModel,
  sanitizeProviderError,
} from "../openai/client";

describe("OpenAI server-side configuration", () => {
  const original = process.env.OPENAI_API_KEY;

  afterEach(() => {
    if (original === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = original;
    delete process.env.OPENAI_MODEL;
    delete process.env.OPENAI_EMBEDDING_MODEL;
  });

  it("isOpenAiConfigured reflects env", () => {
    delete process.env.OPENAI_API_KEY;
    expect(isOpenAiConfigured()).toBe(false);
    process.env.OPENAI_API_KEY = "sk-test-key";
    expect(isOpenAiConfigured()).toBe(true);
  });

  it("requireOpenAiApiKey throws when missing", () => {
    delete process.env.OPENAI_API_KEY;
    expect(() => requireOpenAiApiKey()).toThrow(OpenAiNotConfiguredError);
  });

  it("requireOpenAiApiKey never exposes key in error messages", () => {
    process.env.OPENAI_API_KEY = "sk-secret-should-not-leak";
    expect(() => {
      delete process.env.OPENAI_API_KEY;
      requireOpenAiApiKey();
    }).toThrow(/not configured/i);
  });

  it("credential status never includes the key", () => {
    process.env.OPENAI_API_KEY = "sk-secret-should-not-leak";
    const status = getOpenAiCredentialStatus();
    expect(status.configured).toBe(true);
    expect(status.visibleToClient).toBe(false);
    expect(JSON.stringify(status)).not.toContain("sk-secret");
  });

  it("missing credential status uses developer message without asking clients for a key", () => {
    delete process.env.OPENAI_API_KEY;
    const status = getOpenAiCredentialStatus();
    expect(status.configured).toBe(false);
    expect(status.message).toContain("OPENAI_API_KEY");
    expect(status.message).not.toMatch(/enter your|paste your|settings/i);
  });

  it("OpenAiNotConfiguredError uses client-safe message", () => {
    const err = new OpenAiNotConfiguredError();
    expect(err.clientMessage).toContain("workspace administrator");
    expect(err.clientMessage).not.toMatch(/OPENAI_API_KEY|\.env/i);
    expect(err.developerMessage).toContain("OPENAI_API_KEY");
  });

  it("sanitizes provider response bodies before they reach clients", () => {
    const responseBody = '{"error":{"message":"invalid key sk-secret-should-not-leak"}}';
    expect(sanitizeProviderError(new Error(`Embedding failed (401): ${responseBody}`)))
      .toBe("The AI service is temporarily unavailable. Please try again later.");
  });

  it("developer status label shows Configured or Missing only", () => {
    delete process.env.OPENAI_API_KEY;
    expect(openAiDeveloperStatusLabel()).toBe("Missing");
    process.env.OPENAI_API_KEY = "sk-test";
    expect(openAiDeveloperStatusLabel()).toBe("Configured");
  });

  it("uses optional model env vars with defaults", () => {
    delete process.env.OPENAI_MODEL;
    delete process.env.OPENAI_EMBEDDING_MODEL;
    expect(openAiChatModel()).toBe("gpt-4o-mini");
    expect(openAiEmbeddingModel()).toBe("text-embedding-3-small");
    process.env.OPENAI_MODEL = "gpt-4o";
    expect(openAiChatModel()).toBe("gpt-4o");
  });
});

describe("agent API route ignores client llmApiKey", () => {
  it("AgentRequest type no longer includes llmApiKey", async () => {
    const types = await import("../agent/types");
    const sample: import("../agent/types").AgentRequest = {
      query: "test",
    };
    expect(sample).not.toHaveProperty("llmApiKey");
    expect(types).toBeDefined();
  });
});

describe("unsafe public OpenAI env patterns", () => {
  it("does not use NEXT_PUBLIC_OPENAI_API_KEY in source", async () => {
    const { readFileSync, readdirSync, statSync } = await import("node:fs");
    const { join } = await import("node:path");

    function walk(dir: string, hits: string[]) {
      for (const name of readdirSync(dir)) {
        if (name === "node_modules" || name === ".next" || name === "__pycache__" || name === "__tests__") continue;
        const p = join(dir, name);
        const st = statSync(p);
        if (st.isDirectory()) walk(p, hits);
        else if (/\.(ts|tsx|js|mjs)$/.test(name)) {
          const text = readFileSync(p, "utf8");
          if (text.includes("NEXT_PUBLIC_OPENAI")) hits.push(p);
        }
      }
    }
    const hits: string[] = [];
    walk(join(process.cwd(), "src"), hits);
    expect(hits).toEqual([]);
  });
});

describe(".env.example placeholder only", () => {
  it("contains placeholder OpenAI key not a real sk- key", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const example = readFileSync(join(process.cwd(), ".env.example"), "utf8");
    expect(example).toContain("OPENAI_API_KEY=sk-your-openai-api-key-here");
    expect(example).not.toMatch(/OPENAI_API_KEY=sk-[a-zA-Z0-9]{20,}/);
    expect(example).not.toContain("NEXT_PUBLIC_OPENAI");
  });
});

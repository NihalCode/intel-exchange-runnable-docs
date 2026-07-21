import { afterEach, describe, expect, it } from "vitest";

import { getRetrievalHealthStatus } from "@/lib/agent/retrieval-health";
import {
  resolveChunkIdForPineconeMatch,
  scoredChunksByIds,
} from "@/lib/agent/retrieve";
import type { AgentIndex } from "@/lib/agent/types";

const ORIG = { ...process.env };

afterEach(() => {
  process.env = { ...ORIG };
});

describe("getRetrievalHealthStatus", () => {
  it("reports pinecone_not_configured when only OpenAI is set", () => {
    process.env.OPENAI_API_KEY = "sk-test";
    delete process.env.PINECONE_API_KEY;
    delete process.env.VECTOR_NAMESPACE;
    process.env.APP_PRODUCT_ID = "ctix";

    const status = getRetrievalHealthStatus();
    expect(status.ready).toBe(false);
    expect(status.openaiConfigured).toBe(true);
    expect(status.pineconeConfigured).toBe(false);
    expect(status.namespace).toBe("product-ctix");
    expect(status.reasonCodes).toContain("pinecone_not_configured");
    expect(JSON.stringify(status)).not.toMatch(/sk-test|pc-/i);
  });

  it("reports ready when both providers are configured", () => {
    process.env.OPENAI_API_KEY = "sk-test";
    process.env.PINECONE_API_KEY = "pc-test";
    process.env.PINECONE_INDEX = "intel-exchange-docs";
    process.env.APP_PRODUCT_ID = "cftr";
    delete process.env.VECTOR_NAMESPACE;

    const status = getRetrievalHealthStatus();
    expect(status.ready).toBe(true);
    expect(status.namespace).toBe("product-cftr");
    expect(status.reasonCodes).toEqual(["hybrid_ok"]);
  });
});

describe("combined-index pinecone id alignment", () => {
  const combined: AgentIndex = {
    version: 1,
    generatedAt: "x",
    chunkCount: 2,
    hasEmbeddings: false,
    chunks: [
      {
        id: "ctix::tags::section",
        productId: "ctix",
        slug: "tags",
        title: "Tags",
        kind: "section",
        breadcrumb: [],
        text: "tags",
      },
      {
        id: "orchestrate::tags::section",
        productId: "orchestrate",
        slug: "tags",
        title: "Tags",
        kind: "section",
        breadcrumb: [],
        text: "tags",
      },
    ],
    lexical: { docCount: 2, avgDocLen: 1, df: {}, docs: [] },
  };

  it("resolves raw pinecone ids via metadata productId", () => {
    const byId = new Map(combined.chunks.map((c) => [c.id, c]));
    expect(
      resolveChunkIdForPineconeMatch("tags::section", byId, "ctix")
    ).toBe("ctix::tags::section");
  });

  it("scores ctix matches without false vector_id_mismatch", () => {
    const scored = scoredChunksByIds(
      [{ id: "tags::section", score: 0.9, metadata: { productId: "ctix" } }],
      combined,
      "ctix"
    );
    expect(scored).toHaveLength(1);
    expect(scored[0].productId).toBe("ctix");
  });
});

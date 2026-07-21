import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { getPineconeConfig, isPineconeConfigured, queryPinecone } from "../agent/pinecone";
import { scoredChunksByIds } from "../agent/retrieve";
import type { AgentIndex } from "../agent/types";

const ORIG = { ...process.env };

afterEach(() => {
  process.env = { ...ORIG };
  vi.restoreAllMocks();
});

describe("getPineconeConfig", () => {
  beforeEach(() => {
    delete process.env.PINECONE_API_KEY;
    delete process.env.PINECONE_INDEX;
  });

  it("returns null when no api key", () => {
    expect(getPineconeConfig()).toBeNull();
    expect(isPineconeConfigured()).toBe(false);
  });

  it("returns config with defaults when api key present", () => {
    process.env.PINECONE_API_KEY = "pc-test";
    const cfg = getPineconeConfig();
    expect(cfg?.apiKey).toBe("pc-test");
    expect(cfg?.indexName).toBe("intel-exchange-docs");
    expect(cfg?.cloud).toBe("aws");
    expect(isPineconeConfigured()).toBe(true);
  });
});

describe("queryPinecone", () => {
  it("returns [] when the index host cannot be resolved", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("not found", { status: 404 }))
    );
    const matches = await queryPinecone([0.1, 0.2], 5, {
      apiKey: "k",
      indexName: "missing-index-test",
      cloud: "aws",
      region: "us-east-1",
    });
    expect(matches).toEqual([]);
  });

  it("returns matches when host + query succeed", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes("api.pinecone.io/indexes/")) {
        return new Response(JSON.stringify({ host: "h.example.com", status: { ready: true } }), {
          status: 200,
        });
      }
      const body = JSON.parse(String(init?.body ?? "{}")) as { namespace?: string };
      expect(body.namespace).toBe("product-ctix");
      return new Response(
        JSON.stringify({ matches: [{ id: "tags/list-tags::endpoint", score: 0.91 }] }),
        { status: 200 }
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    process.env.APP_PRODUCT_ID = "ctix";
    const matches = await queryPinecone([0.1, 0.2], 5, {
      apiKey: "k",
      indexName: "query-success-test",
      cloud: "aws",
      region: "us-east-1",
      namespace: "product-ctix",
    });
    expect(matches[0]?.id).toBe("tags/list-tags::endpoint");
    expect(matches[0]?.score).toBeCloseTo(0.91);
    delete process.env.APP_PRODUCT_ID;
  });
});

describe("scoredChunksByIds", () => {
  const index: AgentIndex = {
    version: 1,
    generatedAt: "x",
    chunkCount: 1,
    hasEmbeddings: false,
    chunks: [
      {
        id: "tags/list-tags::endpoint",
        slug: "tags/list-tags",
        title: "Get Tags List",
        kind: "endpoint",
        method: "GET",
        path: "ingestion/tags/",
        breadcrumb: [],
        text: "Get Tags List",
      },
    ],
    lexical: { docCount: 1, avgDocLen: 1, df: {}, docs: [] },
  };

  it("maps pinecone matches back to local chunks", () => {
    const scored = scoredChunksByIds(
      [{ id: "tags/list-tags::endpoint", score: 0.91 }],
      index
    );
    expect(scored).toHaveLength(1);
    expect(scored[0].slug).toBe("tags/list-tags");
    expect(scored[0].semanticScore).toBeCloseTo(0.91);
  });

  it("maps unprefixed pinecone ids onto combined-index product prefixes", () => {
    const combined: AgentIndex = {
      ...index,
      chunks: [
        {
          ...index.chunks[0],
          id: "ctix::tags/list-tags::endpoint",
          productId: "ctix",
        },
      ],
    };
    const scored = scoredChunksByIds(
      [
        {
          id: "tags/list-tags::endpoint",
          score: 0.88,
          metadata: { productId: "ctix" },
        },
      ],
      combined,
      "ctix"
    );
    expect(scored).toHaveLength(1);
    expect(scored[0].id).toBe("ctix::tags/list-tags::endpoint");
  });

  it("skips unknown ids", () => {
    expect(scoredChunksByIds([{ id: "nope", score: 1 }], index)).toEqual([]);
  });
});

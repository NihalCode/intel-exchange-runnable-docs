import { readFile, access } from "node:fs/promises";
import path from "node:path";
import type { AgentChunk, AgentIndex, ScoredChunk } from "@/lib/agent/types";
import { retrieveLexical } from "@/lib/agent/retrieve";
import { getProduct, docsUrlForSlug } from "./registry";
import type { ProductSearchResult } from "./types";

const CONTENT_ROOT = path.join(process.cwd(), "src", "content");

async function fileExists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function loadProductIndex(productId: string): Promise<AgentIndex | null> {
  const indexPath =
    productId === "ctix"
      ? path.join(CONTENT_ROOT, "agent-index.json")
      : path.join(CONTENT_ROOT, "products", productId, "agent-index.json");
  if (!(await fileExists(indexPath))) return null;
  const raw = await readFile(indexPath, "utf8");
  const index = JSON.parse(raw) as AgentIndex;
  for (const chunk of index.chunks) {
    const c = chunk as AgentChunk & { productId?: string };
    if (!c.productId) c.productId = productId;
  }
  return index;
}

let combinedCache: AgentIndex | null = null;

/** Load and merge agent indexes from all indexed products. */
export async function loadCombinedAgentIndex(): Promise<AgentIndex> {
  if (combinedCache) return combinedCache;

  const productIds = ["ctix", "csap", "orchestrate", "cftr"];
  const allChunks: (AgentChunk & { productId: string })[] = [];
  const allDocs: AgentIndex["lexical"]["docs"] = [];
  const df: Record<string, number> = {};
  let totalLen = 0;

  for (const productId of productIds) {
    const index = await loadProductIndex(productId);
    if (!index) continue;
    const idPrefix = `${productId}::`;
    for (const chunk of index.chunks) {
      allChunks.push({
        ...chunk,
        id: chunk.id.startsWith(idPrefix) ? chunk.id : `${idPrefix}${chunk.id}`,
        productId,
      } as AgentChunk & { productId: string });
    }
    for (const doc of index.lexical.docs) {
      const chunkId = doc.chunkId.startsWith(idPrefix) ? doc.chunkId : `${idPrefix}${doc.chunkId}`;
      allDocs.push({ ...doc, chunkId });
      totalLen += doc.length;
      for (const term of Object.keys(doc.terms)) {
        df[term] = (df[term] ?? 0) + 1;
      }
    }
  }

  combinedCache = {
    version: 1,
    generatedAt: new Date().toISOString(),
    chunkCount: allChunks.length,
    hasEmbeddings: allChunks.some((c) => c.embedding?.length),
    chunks: allChunks,
    lexical: {
      docCount: allDocs.length,
      avgDocLen: allDocs.length ? totalLen / allDocs.length : 1,
      df,
      docs: allDocs,
    },
  };
  return combinedCache;
}

export function searchDocs(
  index: AgentIndex,
  query: string,
  opts: { productId?: string; limit?: number }
): ProductSearchResult[] {
  const limit = opts.limit ?? 12;
  const scored = retrieveLexical(query, index, limit * 3);
  const filtered = opts.productId && opts.productId !== "all"
    ? scored.filter((c) => (c as ScoredChunk & { productId?: string }).productId === opts.productId)
    : scored;

  return filtered.slice(0, limit).map((c) => {
    const chunk = c as ScoredChunk & { productId?: string };
    const productId = chunk.productId ?? "ctix";
    const product = getProduct(productId);
    const excerpt = chunk.text.slice(0, 240).replace(/\s+/g, " ");
    return {
      productId,
      productName: product?.productName ?? productId,
      slug: chunk.slug,
      title: chunk.title,
      kind: chunk.kind,
      method: chunk.method,
      path: chunk.path,
      score: chunk.score,
      excerpt: excerpt.length < chunk.text.length ? `${excerpt}…` : excerpt,
      sourceUrl: product ? docsUrlForSlug(product, chunk.slug) : "",
    };
  });
}

export function clearCombinedIndexCache(): void {
  combinedCache = null;
}

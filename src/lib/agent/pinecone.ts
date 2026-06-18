/**
 * Minimal Pinecone REST client (no SDK dependency).
 *
 * Used server-side only for RAG retrieval. If PINECONE_API_KEY is unset the
 * caller falls back to the local BM25 index, so this module is a no-op offline
 * (tests, SSG build, dev without creds).
 */

const CONTROL_PLANE = "https://api.pinecone.io";

export interface PineconeConfig {
  apiKey: string;
  indexName: string;
  cloud: string;
  region: string;
}

export interface PineconeMatch {
  id: string;
  score: number;
  metadata?: Record<string, unknown>;
}

/** Read Pinecone config from env. Returns null when creds are absent. */
export function getPineconeConfig(): PineconeConfig | null {
  const apiKey = process.env.PINECONE_API_KEY?.trim();
  if (!apiKey) return null;
  return {
    apiKey,
    indexName: process.env.PINECONE_INDEX?.trim() || "intel-exchange-docs",
    cloud: process.env.PINECONE_CLOUD?.trim() || "aws",
    region: process.env.PINECONE_REGION?.trim() || "us-east-1",
  };
}

export function isPineconeConfigured(): boolean {
  return Boolean(process.env.PINECONE_API_KEY?.trim());
}

async function pineconeFetch(
  url: string,
  apiKey: string,
  init: RequestInit = {},
  timeoutMs = 8000
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        "Api-Key": apiKey,
        "Content-Type": "application/json",
        "X-Pinecone-API-Version": "2025-01",
        ...(init.headers ?? {}),
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

/** Resolve the data-plane host for an index (cached per process). */
const hostCache = new Map<string, string>();

export async function describeIndexHost(cfg: PineconeConfig): Promise<string | null> {
  const cached = hostCache.get(cfg.indexName);
  if (cached) return cached;
  const res = await pineconeFetch(`${CONTROL_PLANE}/indexes/${cfg.indexName}`, cfg.apiKey);
  if (!res.ok) return null;
  const data = (await res.json()) as { host?: string };
  if (!data.host) return null;
  hostCache.set(cfg.indexName, data.host);
  return data.host;
}

/** Query topK nearest vectors. Returns [] on any failure (caller falls back). */
export async function queryPinecone(
  embedding: number[],
  topK: number,
  cfg: PineconeConfig
): Promise<PineconeMatch[]> {
  try {
    const host = await describeIndexHost(cfg);
    if (!host) return [];
    const res = await pineconeFetch(`https://${host}/query`, cfg.apiKey, {
      method: "POST",
      body: JSON.stringify({
        vector: embedding,
        topK,
        includeMetadata: true,
        includeValues: false,
      }),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { matches?: PineconeMatch[] };
    return data.matches ?? [];
  } catch {
    return [];
  }
}

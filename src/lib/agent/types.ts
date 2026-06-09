import type { HttpMethod, KeyValue, RunnableRequest } from "../types";

export type AgentLanguage = "curl" | "javascript" | "python" | "java" | "go";

export type AgentChunkKind = "endpoint" | "section";

export interface AgentChunk {
  id: string;
  slug: string;
  title: string;
  kind: AgentChunkKind;
  method?: HttpMethod;
  path?: string;
  breadcrumb: string[];
  text: string;
  /** Optional embedding vector (text-embedding-3-small). */
  embedding?: number[];
}

export interface LexicalDoc {
  chunkId: string;
  length: number;
  terms: Record<string, number>;
}

export interface AgentIndex {
  version: 1;
  generatedAt: string;
  chunkCount: number;
  hasEmbeddings: boolean;
  chunks: AgentChunk[];
  lexical: {
    docCount: number;
    avgDocLen: number;
    df: Record<string, number>;
    docs: LexicalDoc[];
  };
}

export interface ScoredChunk extends AgentChunk {
  score: number;
  lexicalScore: number;
  semanticScore: number;
}

export interface AgentCitation {
  slug: string;
  title: string;
  url: string;
}

export interface StepParamOverrides {
  path?: Record<string, string>;
  query?: Record<string, string>;
  body?: Record<string, unknown>;
  form?: Record<string, string>;
}

export interface AgentPlanStep {
  slug: string;
  order: number;
  explanation: string;
  params?: StepParamOverrides;
}

export interface AgentPlan {
  workflow: string;
  confidence: number;
  steps: AgentPlanStep[];
  questions?: string[];
  citations: AgentCitation[];
}

export interface ValidatedStep extends AgentPlanStep {
  title: string;
  method: HttpMethod;
  path: string;
  docUrl: string;
  warnings: string[];
}

export interface AgentStepResult extends ValidatedStep {
  code: string;
  request: RunnableRequest;
}

export interface AgentResponse {
  workflow: string;
  confidence: number;
  fallback: boolean;
  citations: AgentCitation[];
  steps: AgentStepResult[];
  questions?: string[];
  retrieval?: { slug: string; title: string; score: number }[];
}

export interface AgentRequest {
  query: string;
  language?: AgentLanguage;
  history?: { role: "user" | "assistant"; content: string }[];
  llmApiKey?: string;
}

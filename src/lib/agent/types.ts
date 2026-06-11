import type { HttpMethod, KeyValue, ParamField, RunnableRequest } from "../types";

export type AgentLanguage = "curl" | "javascript" | "python" | "java" | "go";

export type AgentMode = "workflow" | "app";

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
  params: StepParamOverrides;
}

export interface ParamSummary {
  name: string;
  type: string;
  required: boolean;
  description?: string;
  example?: string;
}

export interface StepAuthSpec {
  type: string;
  description: string;
  queryParams: string[];
}

export interface StepEndpointSpec {
  endpoint: string;
  method: HttpMethod;
  path: string;
  contentType: string;
  multipart: boolean;
  auth: StepAuthSpec;
  pathParameters: ParamSummary[];
  queryParameters: ParamSummary[];
  bodyParameters: ParamSummary[];
  headers: ParamSummary[];
  expectedResponse?: {
    statusCode: number;
    description?: string;
    example?: string;
  };
}

export interface StepPlaygroundMeta {
  pathFields?: ParamField[];
  queryFields?: ParamField[];
  bodyFields?: ParamField[];
}

export interface AgentStepResult extends ValidatedStep {
  code: string;
  request: RunnableRequest;
  meta: StepPlaygroundMeta;
  spec: StepEndpointSpec;
}

export interface AppBlueprintFile {
  path: string;
  language: string;
  description: string;
  code: string;
}

export interface AgentAppBlueprint {
  title: string;
  description: string;
  architecture: string;
  setupInstructions: string;
  envExample: string;
  files: AppBlueprintFile[];
  appId?: string;
  version?: number;
  vercelProjectName?: string;
  deploymentUrl?: string;
  deploymentId?: string;
}

export type FileChangeStatus = "added" | "removed" | "modified" | "unchanged";

export interface AppFileDiff {
  path: string;
  status: Exclude<FileChangeStatus, "unchanged">;
  additions: number;
  deletions: number;
  preview: string;
}

export interface AgentAppDiff {
  fromVersion: number;
  toVersion: number;
  summary: string;
  files: AppFileDiff[];
  stats: { added: number; removed: number; modified: number; unchanged: number };
}

export interface SavedAppVersion {
  version: number;
  createdAt: string;
  summary: string;
  files: { path: string; code: string; language?: string; description?: string }[];
}

export interface SavedAppProject {
  id: string;
  title: string;
  vercelProjectName: string;
  deploymentUrl?: string;
  deploymentId?: string;
  updatedAt: string;
  versions: SavedAppVersion[];
}

export interface ExistingAppContext {
  appId?: string;
  title: string;
  version?: number;
  vercelProjectName?: string;
  deploymentUrl?: string;
  files: { path: string; code: string; language?: string; description?: string }[];
}

export type ScriptLanguage = "python" | "javascript";

/** A single self-contained, runnable workflow script (auth + retries + chaining baked in). */
export interface WorkflowScript {
  language: ScriptLanguage;
  label: string;
  filename: string;
  code: string;
  /** Human-readable notes about chaining/conditionals the generator applied. */
  notes: string[];
}

export interface AgentResponse {
  mode: AgentMode;
  workflow: string;
  confidence: number;
  fallback: boolean;
  citations: AgentCitation[];
  steps: AgentStepResult[];
  questions?: string[];
  retrieval?: { slug: string; title: string; score: number }[];
  app?: AgentAppBlueprint;
  appDiff?: AgentAppDiff;
  appEdit?: boolean;
  /** Standalone runnable scripts implementing the whole workflow (workflow mode). */
  scripts?: WorkflowScript[];
}

export interface AgentRequest {
  query: string;
  mode?: AgentMode;
  language?: AgentLanguage;
  history?: { role: "user" | "assistant"; content: string }[];
  llmApiKey?: string;
  existingApp?: ExistingAppContext;
}

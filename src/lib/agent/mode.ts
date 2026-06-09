import type { AgentMode } from "./types";

const APP_SIGNAL =
  /\b(build|create|make|develop|generate|scaffold)\b[\s\S]{0,40}\b(app|application|website|web app|dashboard|portal|tool|analyzer|platform)\b/i;

const APP_USE_CASE =
  /\b(phishing|email analyzer|ioc checker|threat intel portal|intel dashboard)\b/i;

export function detectAgentMode(query: string, explicit?: AgentMode): AgentMode {
  if (explicit) return explicit;
  const q = query.trim();
  if (APP_SIGNAL.test(q) || APP_USE_CASE.test(q)) return "app";
  return "workflow";
}

export function isAppBuilderQuery(query: string): boolean {
  return detectAgentMode(query) === "app";
}

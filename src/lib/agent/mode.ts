import type { AgentMode, ExistingAppContext } from "./types";

const APP_SIGNAL =
  /\b(build|create|make|develop|generate|scaffold)\b[\s\S]{0,40}\b(app|application|website|web app|dashboard|portal|tool|analyzer|platform)\b/i;

const APP_USE_CASE =
  /\b(phishing|email analyzer|ioc checker|threat intel portal|intel dashboard)\b/i;

export function detectAgentMode(query: string, explicit?: AgentMode): AgentMode {
  if (explicit === "workflow") return "workflow";
  if (explicit === "app") return "app";
  const q = query.trim();
  if (APP_SIGNAL.test(q) || APP_USE_CASE.test(q)) return "app";
  return "workflow";
}

export function isAppBuilderQuery(query: string): boolean {
  return detectAgentMode(query) === "app";
}

/**
 * Resolve run mode from the user's tab choice. A saved app is only edited when
 * the user is explicitly in Build app mode — not when Run workflow is selected.
 */
export function resolveAgentRun(req: {
  mode?: AgentMode;
  query?: string;
  existingApp?: ExistingAppContext;
}): { mode: AgentMode; editExistingApp: boolean } {
  const mode = req.mode ?? detectAgentMode(req.query ?? "");
  const editExistingApp =
    mode === "app" && (req.existingApp?.files?.length ?? 0) > 0;
  return { mode, editExistingApp };
}

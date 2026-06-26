import type { AgentMode } from "./types";

const EXPLAIN_SIGNAL =
  /\b(explain (simply|like i|in plain|for (a )?non-?technical|layman|simply)|explain this (code|api|endpoint)|what does this (code|do)|help me understand|in simple terms|like i am not a developer|like i'm not a developer)\b/i;

const SNIPPET_SIGNAL =
  /\b(snippet|curl|code example|show (me )?the (api )?code|fetch example|python example|javascript example|typescript example)\b/i;

const APP_SIGNAL =
  /\b(build|create|make|develop|generate|scaffold|turn .+ into (a )?(app|form|dashboard|tool|website))\b[\s\S]{0,60}\b(app|application|website|web app|dashboard|portal|tool|analyzer|platform|form|frontend)\b/i;

const APP_USE_CASE =
  /\b(phishing|email analyzer|ioc checker|threat intel (portal|dashboard)|alert viewer|workflow launcher|investigation helper|report generator|admin panel)\b/i;

const EDIT_SIGNAL =
  /\b(add|change|update|fix|rename|delete|remove|make it|cleaner|easier|export|filter|chart|ui look|use the (cftr|csap|orchestrate|ctix))\b/i;

const DEPLOY_SIGNAL = /\b(deploy|publish|ship|put (it )?live|vercel)\b/i;
const COMMIT_SIGNAL = /\b(commit|save to git|push to github|git commit)\b/i;
const PREVIEW_SIGNAL = /\b(preview|run (the )?app|test (the )?app|try it)\b/i;

export type AgentIntent =
  | "explain"
  | "snippet"
  | "app_build"
  | "app_edit"
  | "workflow"
  | "deploy"
  | "commit"
  | "preview";

export interface ResolvedAgentIntent {
  intent: AgentIntent;
  mode: AgentMode;
  editExistingApp: boolean;
  /** Plain-language label shown in UI (non-technical). */
  userLabel: string;
}

const INTENT_LABELS: Record<AgentIntent, string> = {
  explain: "Explaining in simple terms",
  snippet: "Finding API example code",
  app_build: "Building your app",
  app_edit: "Updating your app",
  workflow: "Planning next steps",
  deploy: "Preparing to deploy",
  commit: "Preparing to save changes",
  preview: "Getting ready to preview",
};

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

export function isExplainQuery(query: string): boolean {
  return EXPLAIN_SIGNAL.test(query);
}

/** Unified intent routing — user talks naturally; agent picks the tool internally. */
export function resolveAgentIntent(
  query: string,
  opts: { hasProjectFiles: boolean; explicitMode?: AgentMode }
): ResolvedAgentIntent {
  const q = query.trim();

  if (COMMIT_SIGNAL.test(q)) {
    return {
      intent: "commit",
      mode: "app",
      editExistingApp: opts.hasProjectFiles,
      userLabel: INTENT_LABELS.commit,
    };
  }
  if (DEPLOY_SIGNAL.test(q)) {
    return {
      intent: "deploy",
      mode: "app",
      editExistingApp: opts.hasProjectFiles,
      userLabel: INTENT_LABELS.deploy,
    };
  }
  if (PREVIEW_SIGNAL.test(q) && opts.hasProjectFiles) {
    return {
      intent: "preview",
      mode: "app",
      editExistingApp: true,
      userLabel: INTENT_LABELS.preview,
    };
  }
  if (EXPLAIN_SIGNAL.test(q)) {
    return {
      intent: "explain",
      mode: opts.hasProjectFiles ? "app" : "workflow",
      editExistingApp: false,
      userLabel: INTENT_LABELS.explain,
    };
  }
  if (SNIPPET_SIGNAL.test(q)) {
    return {
      intent: "snippet",
      mode: "workflow",
      editExistingApp: false,
      userLabel: INTENT_LABELS.snippet,
    };
  }

  const wantsApp = APP_SIGNAL.test(q) || APP_USE_CASE.test(q);
  if (opts.hasProjectFiles && (EDIT_SIGNAL.test(q) || wantsApp || opts.explicitMode === "app")) {
    return {
      intent: "app_edit",
      mode: "app",
      editExistingApp: true,
      userLabel: INTENT_LABELS.app_edit,
    };
  }
  if (wantsApp) {
    return {
      intent: "app_build",
      mode: "app",
      editExistingApp: false,
      userLabel: INTENT_LABELS.app_build,
    };
  }

  const mode = opts.explicitMode ?? "workflow";
  return {
    intent: "workflow",
    mode,
    editExistingApp: opts.hasProjectFiles && mode === "app",
    userLabel: INTENT_LABELS.workflow,
  };
}

/** @deprecated Use resolveAgentIntent — kept for tests migrating from tab-based mode. */
export function resolveAgentRun(req: {
  mode?: AgentMode;
  query?: string;
  existingApp?: { files?: unknown[] };
}): { mode: AgentMode; editExistingApp: boolean } {
  const hasFiles = (req.existingApp?.files?.length ?? 0) > 0;
  const resolved = resolveAgentIntent(req.query ?? "", {
    hasProjectFiles: hasFiles,
    explicitMode: req.mode,
  });
  return { mode: resolved.mode, editExistingApp: resolved.editExistingApp };
}

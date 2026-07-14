import type { AgentMode } from "./types";

import { isNonTechnicalQuery, isHandoffQuery } from "./non-technical";

export { isNonTechnicalQuery, isHandoffQuery };

const SNIPPET_SIGNAL =
  /\b(snippet|curl|code example|show (me )?the (api )?code|fetch example|python example|javascript example|typescript example|(?:give|show|write)\s+(?:me\s+)?(?:a\s+)?(?:python|javascript|typescript|js|ts)\b)/i;

/** Conceptual product/API explainers that are not app-builder requests. */
const CONCEPTUAL_EXPLAIN_SIGNAL =
  /^(?:what\s+(?:is|are|does|do)\b|explain\b)/i;

const APP_SIGNAL =
  /\b(build|create|make|develop|generate|scaffold|turn .+ into (a )?(app|form|dashboard|tool|website))\b[\s\S]{0,60}\b(app|application|website|web app|dashboard|portal|tool|analyzer|platform|form|frontend)\b/i;

/** References that make an edit to the loaded application unambiguous. */
const PROJECT_EDIT_SIGNAL =
  /\b(?:app\/[\w./-]+\.(?:tsx?|jsx?)|[\w./-]+\.(?:tsx?|jsx?)|in (?:the )?(?:app|project|generated app)|(?:change|edit|update|fix)\s+(?:the )?(?:code|ui|app|project|page|component))\b/i;

/** A construction verb plus a UI feature is an edit request, not API troubleshooting. */
const UI_EDIT_SIGNAL =
  /\b(?:add|change|update|remove|delete|rename|redesign|restyle|improve|fix)\s+(?:(?:a|an|the)\s+)?(?:filter|chart|dashboard|dark mode|theme|button|table|form|modal|navigation|sidebar|layout|page|component|ui|user interface|export(?:\s+(?:button|action|control|feature|to csv|csv)))\b/i;

/** Documentation/API failures must not be mistaken for loaded-app edits. */
const API_TROUBLESHOOTING_SIGNAL =
  /\b(?:http\s*)?(?:400|401|403|404|409|422|429|500|502|503|504)\b|\b(?:endpoint|api|exporting indicators|after (?:an )?upgrade)\b/i;

const DEPLOY_SIGNAL =
  /\b(?:deploy|publish|ship|put (it )?live)\b.+\b(?:app|project|site|frontend|vercel)\b|\bvercel\b.+\b(?:deploy|publish)\b|\bdeploy (?:to |on )?vercel\b/i;
const COMMIT_SIGNAL =
  /\b(?:save to git|push to github|git commit)\b|\bcommit\b.+\b(?:app|project|changes|workspace|generated)\b|\b(?:app|project|changes|workspace)\b.+\bcommit\b/i;
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
  if (APP_SIGNAL.test(q)) return "app";
  return "workflow";
}

export function isAppBuilderQuery(query: string): boolean {
  return detectAgentMode(query) === "app";
}

export function isExplainQuery(query: string): boolean {
  return isNonTechnicalQuery(query);
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
  if (isNonTechnicalQuery(q) || CONCEPTUAL_EXPLAIN_SIGNAL.test(q)) {
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

  const wantsApp = APP_SIGNAL.test(q);
  const wantsAppEdit = PROJECT_EDIT_SIGNAL.test(q) || UI_EDIT_SIGNAL.test(q);
  const isApiTroubleshooting = API_TROUBLESHOOTING_SIGNAL.test(q);

  // API/docs troubleshooting wins over ambiguous UI phrases ("fix export count").
  if (isApiTroubleshooting && !wantsApp) {
    return {
      intent: "workflow",
      mode: "workflow",
      editExistingApp: false,
      userLabel: INTENT_LABELS.workflow,
    };
  }
  if (opts.hasProjectFiles && (wantsAppEdit || wantsApp)) {
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

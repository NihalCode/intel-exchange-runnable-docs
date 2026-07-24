export const DOCUMENTATION_FEATURE_KEYS = [
  "ai_documentation_assistant",
  "require_product_credentials_for_agent",
  "app_builder",
  "project_workspace",
  "preview",
  "vercel_deployment",
  "git_commit",
  "project_download",
  "vercel_import",
  "api_testing_console",
  "generated_code_examples",
  "public_changelog",
  "public_documentation_search",
  "support_agent",
  "placeholder_admin_modules",
  "host_based_product_routing",
  "separate_admin_domain",
  "cross_domain_sso",
  "query_analytics",
  "unanswered_query_review",
  "chat_feedback",
  "unanswered_query_sensitive_capture",
  "unanswered_query_realtime_summary",
  "unanswered_query_weekly_analytics",
  "recaptcha_protection",
  "viewer_ask_ai_access_enabled",
  "chat_response_navigation",
  "custom_snippet_query_parameters",
  "multi_project_deployment",
  "vercel_domain_automation",
  "production_query_metrics",
  "admin_deployment_management",
  "enterprise_ui_v2",
] as const;

export type DocumentationFeatureKey = (typeof DOCUMENTATION_FEATURE_KEYS)[number];

const DEFAULT_ENABLED = new Set<DocumentationFeatureKey>([
  "ai_documentation_assistant",
  /** Default on: Ask AI requires a connected Open API product (or host-pinned product). */
  "require_product_credentials_for_agent",
  "generated_code_examples",
  "public_changelog",
  "public_documentation_search",
  /** Default on: thumbs on every Ask AI answer (anonymous + signed-in). */
  "chat_feedback",
  /** Default on: new Cyware token system is the live visual system. */
  "enterprise_ui_v2",
]);

/** Short labels for Admin → Features (falls back to raw key). */
export const DOCUMENTATION_FEATURE_LABELS: Partial<
  Record<DocumentationFeatureKey, string>
> = {
  ai_documentation_assistant: "Ask AI assistant",
  require_product_credentials_for_agent:
    "Require Open API product credentials for Ask AI",
  app_builder: "Build App",
  project_workspace: "Project workspace",
  preview: "Preview sandbox",
  vercel_deployment: "Vercel deploy",
  git_commit: "Git commit",
  project_download: "Download zip",
  vercel_import: "Import from Vercel",
  api_testing_console: "API testing console",
  generated_code_examples: "Generated code examples",
  public_changelog: "Changelog",
  public_documentation_search: "Documentation search",
  query_analytics: "Query analytics",
  unanswered_query_review: "Unanswered query review",
  chat_feedback: "Chat feedback (thumbs)",
  unanswered_query_sensitive_capture: "Unanswered sensitive capture",
  unanswered_query_realtime_summary: "Unanswered realtime summary",
  unanswered_query_weekly_analytics: "Unanswered weekly analytics",
  recaptcha_protection: "reCAPTCHA protection",
  viewer_ask_ai_access_enabled: "Viewer Ask AI access",
  multi_project_deployment: "Multi-product deployment",
  admin_deployment_management: "Admin deployment management",
  vercel_domain_automation: "Vercel domain automation",
  host_based_product_routing: "Host-based product routing",
  cross_domain_sso: "Cross-domain SSO",
  enterprise_ui_v2: "Enterprise UI (Cyware tokens)",
};

export function defaultDocumentationFeatureEnabled(
  key: DocumentationFeatureKey
): boolean {
  return DEFAULT_ENABLED.has(key);
}

/** Flags shown on Admin → Features for this product (excludes deferred/unused modules). */
export const ADMIN_FEATURE_SECTIONS: ReadonlyArray<{
  id: string;
  title: string;
  description?: string;
  keys: readonly DocumentationFeatureKey[];
}> = [
  {
    id: "docs",
    title: "Documentation workspace",
    description: "Core docs, search, changelog, and runnable API console.",
    keys: [
      "generated_code_examples",
      "public_changelog",
      "public_documentation_search",
      "api_testing_console",
      "enterprise_ui_v2",
    ],
  },
  {
    id: "agent",
    title: "Ask AI / app builder",
    description:
      "Agent chat, credential gate, preview, and deploy/import actions. Turn off “Require Open API product credentials” to allow Ask AI with Auth0 only (docs answers; live Run still needs secrets).",
    keys: [
      "ai_documentation_assistant",
      "require_product_credentials_for_agent",
      "viewer_ask_ai_access_enabled",
      "app_builder",
      "project_workspace",
      "preview",
      "vercel_deployment",
      "git_commit",
      "project_download",
      "vercel_import",
    ],
  },
  {
    id: "multi_project",
    title: "Multi-product deployments",
    description:
      "Already active on pinned product Vercel projects even when the DB toggle shows Disabled.",
    keys: [
      "multi_project_deployment",
      "admin_deployment_management",
      "vercel_domain_automation",
      "host_based_product_routing",
    ],
  },
  {
    id: "analytics",
    title: "Analytics (optional)",
    description: "Query metrics, unanswered intelligence, feedback, and abuse protection.",
    keys: [
      "query_analytics",
      "unanswered_query_review",
      "unanswered_query_sensitive_capture",
      "unanswered_query_realtime_summary",
      "unanswered_query_weekly_analytics",
      "chat_feedback",
      "recaptcha_protection",
      "production_query_metrics",
      "chat_response_navigation",
      "custom_snippet_query_parameters",
    ],
  },
];

export const ADMIN_VISIBLE_FEATURE_KEYS: readonly DocumentationFeatureKey[] =
  ADMIN_FEATURE_SECTIONS.flatMap((section) => [...section.keys]);


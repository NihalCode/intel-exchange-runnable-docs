export const DOCUMENTATION_FEATURE_KEYS = [
  "ai_documentation_assistant",
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
  "chat_response_navigation",
  "custom_snippet_query_parameters",
  "multi_project_deployment",
  "vercel_domain_automation",
  "production_query_metrics",
  "admin_deployment_management",
] as const;

export type DocumentationFeatureKey = (typeof DOCUMENTATION_FEATURE_KEYS)[number];

const DEFAULT_ENABLED = new Set<DocumentationFeatureKey>([
  "ai_documentation_assistant",
  "generated_code_examples",
  "public_changelog",
  "public_documentation_search",
]);

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
      "ai_documentation_assistant",
      "generated_code_examples",
      "public_changelog",
      "public_documentation_search",
      "api_testing_console",
    ],
  },
  {
    id: "agent",
    title: "Ask AI / app builder",
    description: "Agent chat, preview, and deploy/import actions.",
    keys: [
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
    description: "Query metrics and unanswered-question review.",
    keys: [
      "query_analytics",
      "unanswered_query_review",
      "production_query_metrics",
      "chat_response_navigation",
      "custom_snippet_query_parameters",
    ],
  },
];

export const ADMIN_VISIBLE_FEATURE_KEYS: readonly DocumentationFeatureKey[] =
  ADMIN_FEATURE_SECTIONS.flatMap((section) => [...section.keys]);


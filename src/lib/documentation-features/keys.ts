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

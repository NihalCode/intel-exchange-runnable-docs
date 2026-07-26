import "server-only";

import { isMultiProjectDeployment } from "@/lib/deployment/resolve-app-product-id";
import {
  isDocumentationFeatureEnabled,
  type DocumentationFeatureKey,
} from "@/lib/documentation-features";
import { DOCUMENTATION_FEATURE_KEYS } from "@/lib/documentation-features/keys";
import {
  isChatFeedbackEnabled,
  isChatResponseNavigationEnabled,
  isCrossDomainSsoEnabled,
  isCustomSnippetQueryParamsEnabled,
  isDomainRoutingEnabled,
  isProductionQueryMetricsEnabled,
  isQueryAnalyticsEnabled,
  isRecaptchaProtectionEnabled,
  isSeparateAdminDomainEnabled,
  isUnansweredQueryReviewEnabled,
  isUnansweredRealtimeSummaryEnabled,
  isUnansweredSensitiveCaptureEnabled,
  isUnansweredWeeklyAnalyticsEnabled,
  isViewerAskAiAccessEnabled,
} from "@/lib/domains/feature-gates";

export interface ResolveDocumentationFeatureInput {
  organizationId: string;
  key: DocumentationFeatureKey;
  role?: string;
  environment?: string;
}

/** Env + deployment topology overrides, then org feature flags in the database. */
export async function resolveDocumentationFeatureEnabled(
  input: ResolveDocumentationFeatureInput
): Promise<boolean> {
  const multiProject = isMultiProjectDeployment();

  if (input.key === "host_based_product_routing") {
    if (isDomainRoutingEnabled() || multiProject) return true;
  }
  if (input.key === "separate_admin_domain") {
    if (isSeparateAdminDomainEnabled()) return true;
  }
  if (input.key === "cross_domain_sso") {
    if (isCrossDomainSsoEnabled()) return true;
  }
  if (input.key === "query_analytics") {
    if (isQueryAnalyticsEnabled() || multiProject) return true;
  }
  if (input.key === "production_query_metrics") {
    if (isProductionQueryMetricsEnabled() || isQueryAnalyticsEnabled() || multiProject) {
      return true;
    }
  }
  if (input.key === "unanswered_query_review") {
    if (isUnansweredQueryReviewEnabled() || multiProject) return true;
  }
  if (input.key === "unanswered_query_weekly_analytics") {
    if (isUnansweredWeeklyAnalyticsEnabled()) return true;
  }
  if (input.key === "unanswered_query_realtime_summary") {
    if (isUnansweredRealtimeSummaryEnabled()) return true;
  }
  if (input.key === "unanswered_query_sensitive_capture") {
    // Product hosts auto-enable so Ask AI / thumbs-down can encrypt exact queries.
    if (isUnansweredSensitiveCaptureEnabled() || multiProject) return true;
  }
  if (input.key === "chat_feedback") {
    // Product hosts and CHAT_FEEDBACK_ENABLED always expose thumbs controls.
    if (isChatFeedbackEnabled() || multiProject) return true;
  }
  if (input.key === "recaptcha_protection") {
    if (isRecaptchaProtectionEnabled()) return true;
  }
  if (input.key === "viewer_ask_ai_access_enabled") {
    if (isViewerAskAiAccessEnabled()) return true;
  }
  if (input.key === "custom_snippet_query_parameters") {
    if (isCustomSnippetQueryParamsEnabled()) return true;
  }
  if (input.key === "chat_response_navigation") {
    if (isChatResponseNavigationEnabled()) return true;
  }
  if (input.key === "multi_project_deployment" || input.key === "admin_deployment_management") {
    if (multiProject) return true;
  }
  if (input.key === "vercel_domain_automation") {
    if (multiProject) return true;
  }

  return isDocumentationFeatureEnabled(input);
}

export async function listResolvedEnabledFeatureKeys(
  organizationId: string,
  role?: string,
  environment?: string
): Promise<DocumentationFeatureKey[]> {
  const enabled: DocumentationFeatureKey[] = [];
  for (const key of DOCUMENTATION_FEATURE_KEYS) {
    if (
      await resolveDocumentationFeatureEnabled({
        organizationId,
        key,
        role,
        environment,
      })
    ) {
      enabled.push(key);
    }
  }
  return enabled;
}

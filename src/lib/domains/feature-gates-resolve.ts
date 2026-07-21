import "server-only";

import { resolveDocumentationFeatureEnabled } from "@/lib/documentation-features/resolve-enabled";
import type { DocumentationFeatureKey } from "@/lib/documentation-features";
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

type OrgGateInput = {
  organizationId?: string | null;
  role?: string;
  environment?: string;
};

function envOrOrg(
  envEnabled: boolean,
  orgInput: OrgGateInput,
  featureKey: DocumentationFeatureKey
): Promise<boolean> {
  if (envEnabled) return Promise.resolve(true);
  if (!orgInput.organizationId) return Promise.resolve(false);
  // Use resolveDocumentationFeatureEnabled so multi-project / env topology
  // auto-enables (e.g. query_analytics) match admin UI feature resolution.
  return resolveDocumentationFeatureEnabled({
    organizationId: orgInput.organizationId,
    key: featureKey,
    role: orgInput.role,
    environment: orgInput.environment,
  });
}

/** Proxy routing remains env-only (no org context in middleware). */
export function resolveDomainRoutingEnabled(): boolean {
  return isDomainRoutingEnabled();
}

export async function resolveSeparateAdminDomainEnabled(
  org: OrgGateInput = {}
): Promise<boolean> {
  return envOrOrg(isSeparateAdminDomainEnabled(), org, "separate_admin_domain");
}

export async function resolveCrossDomainSsoEnabled(
  org: OrgGateInput = {}
): Promise<boolean> {
  return envOrOrg(isCrossDomainSsoEnabled(), org, "cross_domain_sso");
}

export async function resolveQueryAnalyticsEnabled(
  org: OrgGateInput = {}
): Promise<boolean> {
  return envOrOrg(isQueryAnalyticsEnabled(), org, "query_analytics");
}

export async function resolveCustomSnippetQueryParamsEnabled(
  org: OrgGateInput = {}
): Promise<boolean> {
  return envOrOrg(isCustomSnippetQueryParamsEnabled(), org, "custom_snippet_query_parameters");
}

export async function resolveChatResponseNavigationEnabled(
  org: OrgGateInput = {}
): Promise<boolean> {
  return envOrOrg(isChatResponseNavigationEnabled(), org, "chat_response_navigation");
}

export async function resolveHostBasedProductRoutingEnabled(
  org: OrgGateInput = {}
): Promise<boolean> {
  return envOrOrg(isDomainRoutingEnabled(), org, "host_based_product_routing");
}

export async function resolveProductionQueryMetricsEnabled(
  org: OrgGateInput = {}
): Promise<boolean> {
  return envOrOrg(isProductionQueryMetricsEnabled(), org, "production_query_metrics");
}

export async function resolveUnansweredQueryReviewEnabled(
  org: OrgGateInput = {}
): Promise<boolean> {
  return envOrOrg(isUnansweredQueryReviewEnabled(), org, "unanswered_query_review");
}

export async function resolveChatFeedbackEnabled(
  org: OrgGateInput = {}
): Promise<boolean> {
  return envOrOrg(isChatFeedbackEnabled(), org, "chat_feedback");
}

export async function resolveUnansweredRealtimeSummaryEnabled(
  org: OrgGateInput = {}
): Promise<boolean> {
  return envOrOrg(isUnansweredRealtimeSummaryEnabled(), org, "unanswered_query_realtime_summary");
}

export async function resolveUnansweredWeeklyAnalyticsEnabled(
  org: OrgGateInput = {}
): Promise<boolean> {
  return envOrOrg(isUnansweredWeeklyAnalyticsEnabled(), org, "unanswered_query_weekly_analytics");
}

export async function resolveRecaptchaProtectionEnabled(
  org: OrgGateInput = {}
): Promise<boolean> {
  return envOrOrg(isRecaptchaProtectionEnabled(), org, "recaptcha_protection");
}

export async function resolveViewerAskAiAccessEnabled(
  org: OrgGateInput = {}
): Promise<boolean> {
  return envOrOrg(isViewerAskAiAccessEnabled(), org, "viewer_ask_ai_access_enabled");
}

export async function resolveUnansweredSensitiveCaptureEnabled(
  org: OrgGateInput = {}
): Promise<boolean> {
  return envOrOrg(isUnansweredSensitiveCaptureEnabled(), org, "unanswered_query_sensitive_capture");
}

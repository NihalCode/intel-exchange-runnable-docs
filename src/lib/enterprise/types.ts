import type { DocumentationRole } from "@/lib/documentation-auth/types";

export type EnterpriseRole = "owner" | "admin" | "developer";
export type EnterpriseEnvironment = "development" | "staging" | "production";

export const ENTERPRISE_PERMISSIONS = [
  "admin_dashboard.access",
  "resources.read",
  "resources.write",
  "resources.write_production",
  "changes.create",
  "changes.submit",
  "changes.approve",
  "changes.activate",
  "changes.rollback",
  "credentials.read_metadata",
  "credentials.manage",
  "features.read",
  "features.manage",
  "schemas.read",
  "schemas.manage",
  "schemas.review",
  "schemas.publish",
  "security_settings.manage",
  "audit.read",
  "audit.read_sensitive",
  "jobs.read",
  "jobs.manage",
  "domains.read",
  "domains.manage",
  "collections.read",
  "collections.manage",
  "query_analytics.read",
  "query_analytics.read_sensitive",
  "unanswered_queries.manage",
] as const;

export type EnterprisePermission = (typeof ENTERPRISE_PERMISSIONS)[number];

export interface EnterprisePrincipal {
  userId: string;
  organizationId: string;
  role: DocumentationRole | string;
  status: "active" | "disabled" | "pending";
  permissions?: readonly string[];
}

export interface AuthorizationResource {
  organizationId: string;
  environment?: EnterpriseEnvironment;
  ownerUserId?: string;
  sensitive?: boolean;
}

export interface OrganizationContext {
  organization: {
    id: string;
    auth0OrganizationId: string | null;
    slug: string;
    name: string;
    status: "active" | "suspended";
  };
  membership: {
    id: string;
    userId: string;
    organizationId: string;
    role: string;
    status: "active" | "disabled" | "pending";
    permissions: string[];
  };
  principal: EnterprisePrincipal;
}

export const CHANGE_REQUEST_STATES = [
  "DRAFT",
  "PENDING_REVIEW",
  "APPROVED",
  "REJECTED",
  "SCHEDULED",
  "DEPLOYING",
  "ACTIVE",
  "ROLLED_BACK",
] as const;

export type ChangeRequestState = (typeof CHANGE_REQUEST_STATES)[number];

export interface ChangeRequestRecord {
  id: string;
  organizationId: string;
  resourceId: string;
  targetConfigVersionId: string;
  state: ChangeRequestState;
  requestedByUserId: string;
  approvedByUserId: string | null;
  scheduledFor: string | null;
  activatedAt: string | null;
  rollbackOfChangeRequestId: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

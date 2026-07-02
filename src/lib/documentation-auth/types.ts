export const DOCUMENTATION_ROLES = [
  "owner",
  "admin",
  "documentation_manager",
  "developer",
  "viewer",
] as const;

export type DocumentationRole = (typeof DOCUMENTATION_ROLES)[number];

export type DocumentationUserStatus = "active" | "disabled" | "pending";

export type InviteStatus = "pending" | "accepted" | "expired" | "revoked";

export interface DocumentationUser {
  id: string;
  auth0UserId: string;
  email: string;
  name?: string | null;
  picture?: string | null;
  role: DocumentationRole;
  status: DocumentationUserStatus;
  invitedByUserId?: string | null;
  acceptedInviteAt?: string | null;
  lastLoginAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentationInvite {
  id: string;
  email: string;
  role: DocumentationRole;
  tokenHash: string;
  status: InviteStatus;
  invitedByUserId: string;
  expiresAt: string;
  acceptedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentationAuditLog {
  id: string;
  action: string;
  userId?: string | null;
  actorEmail?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
}

export type DocumentationPermission =
  | "manage_users"
  | "manage_sources"
  | "manage_integrations"
  | "read_docs"
  | "ask_agent"
  | "sync_docs"
  | "view_audit_logs"
  | "view_api_details"
  | "test_snippets"
  | "view_technical_diagnostics";

export type InviteCheckReason =
  | "active_user"
  | "valid_invite"
  | "not_invited"
  | "disabled"
  | "expired_invite";

export interface InviteCheckResponse {
  allowed: boolean;
  reason?: InviteCheckReason;
  role?: DocumentationRole;
}

export type AccessDeniedReason =
  | "invite_required"
  | "disabled"
  | "expired_invite"
  | "revoked_invite"
  | "wrong_invite_email"
  | "not_invited";

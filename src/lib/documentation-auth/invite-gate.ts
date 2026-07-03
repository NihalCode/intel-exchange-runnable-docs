import "server-only";

import { isInitialOwnerEmail } from "@/lib/documentation-auth/env";
import { normalizeEmail, emailDomain } from "@/lib/documentation-auth/email-utils";
import {
  countActiveUsers,
  findInviteByEmail,
  findUserByEmail,
  isValidPendingInvite,
} from "@/lib/db/repository";
import type { DocumentationInvite, DocumentationRole, InviteCheckReason } from "@/lib/documentation-auth/types";

export interface InviteCheckResult {
  allowed: boolean;
  reason: InviteCheckReason;
  role?: DocumentationRole;
  invite?: DocumentationInvite;
}

/** Check whether an email may access the documentation workspace. */
export async function checkEmailAccess(email: string): Promise<InviteCheckResult> {
  const normalized = normalizeEmail(email);
  const existing = await findUserByEmail(normalized);

  // Rule A: active (or pending) user — always allowed, no invite required.
  if (existing) {
    if (existing.status === "disabled") {
      return { allowed: false, reason: "disabled" };
    }
    if (existing.status === "active" || existing.status === "pending") {
      return { allowed: true, reason: "active_user", role: existing.role };
    }
  }

  // Rule E: cold-start bootstrap before stale invite rows can block the owner email.
  if (isInitialOwnerEmail(normalized)) {
    const activeCount = await countActiveUsers();
    if (activeCount === 0) {
      return { allowed: true, reason: "bootstrap_owner", role: "owner" };
    }
  }

  // Rule B: valid pending invite (or accepted invite without user row yet).
  const invite = await findInviteByEmail(normalized);
  if (invite) {
    if (invite.status === "pending" && isValidPendingInvite(invite)) {
      return {
        allowed: true,
        reason: "valid_invite",
        role: invite.role,
        invite,
      };
    }
    if (invite.status === "expired" || (invite.status === "pending" && !isValidPendingInvite(invite))) {
      return { allowed: false, reason: "expired_invite" };
    }
    if (invite.status === "revoked") {
      return { allowed: false, reason: "not_invited" };
    }
    if (invite.status === "accepted") {
      return {
        allowed: true,
        reason: "valid_invite",
        role: invite.role,
        invite,
      };
    }
  }

  // Rule D: uninvited (includes initial owner email once active users exist).
  return { allowed: false, reason: "not_invited" };
}

export { emailDomain };

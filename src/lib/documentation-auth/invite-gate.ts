import "server-only";

import { isInitialOwnerEmail } from "@/lib/documentation-auth/env";
import { normalizeEmail, emailDomain } from "@/lib/documentation-auth/email-utils";
import {
  countActiveUsers,
  findInviteByEmail,
  findPendingInviteByEmail,
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
  const pendingInvite = await findPendingInviteByEmail(normalized);

  // Rule E: cold-start bootstrap before any invite row for the configured owner email.
  if (isInitialOwnerEmail(normalized)) {
    const activeCount = await countActiveUsers();
    if (activeCount === 0) {
      return { allowed: true, reason: "bootstrap_owner", role: "owner" };
    }
  }

  // Rule B: valid pending invite — wins over revoked/expired history and re-enables re-invites.
  if (pendingInvite && isValidPendingInvite(pendingInvite)) {
    return {
      allowed: true,
      reason: "valid_invite",
      role: pendingInvite.role,
      invite: pendingInvite,
    };
  }

  // Rule A: active (or pending) user — always allowed when no newer pending invite applies.
  if (existing) {
    if (existing.status === "disabled") {
      return { allowed: false, reason: "disabled" };
    }
    if (existing.status === "active" || existing.status === "pending") {
      return { allowed: true, reason: "active_user", role: existing.role };
    }
  }

  if (pendingInvite && !isValidPendingInvite(pendingInvite)) {
    return { allowed: false, reason: "expired_invite" };
  }

  const latestInvite = await findInviteByEmail(normalized);
  if (
    latestInvite &&
    (latestInvite.status === "expired" ||
      (latestInvite.status === "pending" && !isValidPendingInvite(latestInvite)))
  ) {
    return { allowed: false, reason: "expired_invite" };
  }

  // Rule D: uninvited.
  return { allowed: false, reason: "not_invited" };
}

export { emailDomain };

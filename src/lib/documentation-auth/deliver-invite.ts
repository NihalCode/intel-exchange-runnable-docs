import "server-only";

import { logDocumentationAuthEvent } from "@/lib/documentation-auth/audit";
import {
  sendDocumentationInviteEmail,
  type InviteEmailDeliveryResult,
} from "@/lib/documentation-auth/invite-email";
import type { DocumentationInvite } from "@/lib/documentation-auth/types";

export async function deliverInviteNotification(input: {
  invite: DocumentationInvite;
  inviteUrl: string;
  invitedByUserId: string;
  invitedByEmail: string;
  invitedByName?: string | null;
  auditAction: "auth.invite_email_sent" | "auth.invite_email_resent";
}): Promise<InviteEmailDeliveryResult> {
  const emailResult = await sendDocumentationInviteEmail({
    toEmail: input.invite.email,
    inviteUrl: input.inviteUrl,
    role: input.invite.role,
    expiresAt: input.invite.expiresAt,
    invitedByEmail: input.invitedByEmail,
    invitedByName: input.invitedByName,
  });

  if (emailResult.sent) {
    await logDocumentationAuthEvent({
      action: input.auditAction,
      userId: input.invitedByUserId,
      actorEmail: input.invitedByEmail,
      metadata: {
        inviteId: input.invite.id,
        invitedEmail: input.invite.email,
        provider: emailResult.provider,
      },
    });
  } else if (emailResult.reason === "provider_error") {
    await logDocumentationAuthEvent({
      action: "auth.invite_email_failed",
      userId: input.invitedByUserId,
      actorEmail: input.invitedByEmail,
      metadata: {
        inviteId: input.invite.id,
        invitedEmail: input.invite.email,
        error: emailResult.message,
      },
    });
  }

  return emailResult;
}

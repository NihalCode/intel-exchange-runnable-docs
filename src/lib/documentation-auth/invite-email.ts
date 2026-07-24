import "server-only";

import type { DocumentationRole } from "@/lib/documentation-auth/types";
import { cleanEnvValue } from "@/lib/documentation-auth/env";

export interface InviteEmailPayload {
  toEmail: string;
  inviteUrl: string;
  role: DocumentationRole;
  expiresAt: string;
  invitedByName?: string | null;
  invitedByEmail: string;
}

export type InviteEmailDeliveryResult =
  | { sent: true; provider: "resend" }
  | { sent: false; reason: "not_configured" }
  | { sent: false; reason: "provider_error"; message: string };

export function isInviteEmailConfigured(): boolean {
  return Boolean(cleanEnvValue(process.env.RESEND_API_KEY));
}

export function inviteEmailFromAddress(): string | null {
  return (
    cleanEnvValue(process.env.INVITE_EMAIL_FROM) ??
    cleanEnvValue(process.env.DOCUMENTATION_INVITE_FROM)
  );
}

export function buildInviteEmailSubject(): string {
  const workspace =
    cleanEnvValue(process.env.INVITE_EMAIL_WORKSPACE_NAME) ?? "Cyware API Docs";
  return `You're invited to ${workspace}`;
}

export function buildInviteEmailHtml(payload: InviteEmailPayload): string {
  const workspace =
    cleanEnvValue(process.env.INVITE_EMAIL_WORKSPACE_NAME) ?? "Cyware API Docs";
  const expiry = new Date(payload.expiresAt).toLocaleDateString(undefined, {
    dateStyle: "medium",
  });
  const inviter = payload.invitedByName?.trim() || payload.invitedByEmail;

  return `<!DOCTYPE html>
<html lang="en">
<body style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;line-height:1.5;color:#18181b;max-width:560px;margin:0 auto;padding:24px;">
  <p>You've been invited to <strong>${escapeHtml(workspace)}</strong>.</p>
  <p><strong>Role:</strong> ${escapeHtml(payload.role)}<br/>
  <strong>Invited by:</strong> ${escapeHtml(inviter)}<br/>
  <strong>Expires:</strong> ${escapeHtml(expiry)}</p>
  <p>Sign up or Sign in with <strong>${escapeHtml(payload.toEmail)}</strong> — use that exact email, set a password, then enter the verification code from your authenticator app.</p>
  <p style="margin:24px 0;">
    <a href="${escapeHtml(payload.inviteUrl)}" style="display:inline-block;background:#0284c7;color:#fff;text-decoration:none;padding:12px 20px;border-radius:6px;font-weight:600;">Accept invite &amp; sign in</a>
  </p>
  <p style="font-size:12px;color:#71717a;">If the button doesn't work, copy this link:<br/>
  <span style="word-break:break-all;">${escapeHtml(payload.inviteUrl)}</span></p>
  <p style="font-size:12px;color:#71717a;">This workspace is invite-only. If you weren't expecting this email, you can ignore it.</p>
</body>
</html>`;
}

export function buildInviteEmailText(payload: InviteEmailPayload): string {
  const workspace =
    cleanEnvValue(process.env.INVITE_EMAIL_WORKSPACE_NAME) ?? "Cyware API Docs";
  const expiry = new Date(payload.expiresAt).toLocaleDateString(undefined, {
    dateStyle: "medium",
  });
  const inviter = payload.invitedByName?.trim() || payload.invitedByEmail;

  return [
    `You've been invited to ${workspace}.`,
    "",
    `Role: ${payload.role}`,
    `Invited by: ${inviter}`,
    `Expires: ${expiry}`,
    "",
    `Sign up or Sign in with ${payload.toEmail} (exact email; password + verification code).`,
    "",
    `Accept invite: ${payload.inviteUrl}`,
  ].join("\n");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Send invite email via Resend when RESEND_API_KEY is configured. */
export async function sendDocumentationInviteEmail(
  payload: InviteEmailPayload
): Promise<InviteEmailDeliveryResult> {
  const apiKey = cleanEnvValue(process.env.RESEND_API_KEY);
  if (!apiKey) {
    return { sent: false, reason: "not_configured" };
  }

  const from = inviteEmailFromAddress();
  if (!from) {
    return {
      sent: false,
      reason: "provider_error",
      message: "INVITE_EMAIL_FROM is not configured.",
    };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [payload.toEmail],
      subject: buildInviteEmailSubject(),
      html: buildInviteEmailHtml(payload),
      text: buildInviteEmailText(payload),
    }),
  });

  if (!response.ok) {
    let message = `Resend returned ${response.status}`;
    try {
      const body = (await response.json()) as { message?: string };
      if (body.message) message = body.message;
    } catch {
      /* ignore */
    }
    return { sent: false, reason: "provider_error", message };
  }

  return { sent: true, provider: "resend" };
}

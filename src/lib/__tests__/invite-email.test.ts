import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildInviteEmailHtml,
  buildInviteEmailSubject,
  buildInviteEmailText,
  isInviteEmailConfigured,
  sendDocumentationInviteEmail,
} from "../documentation-auth/invite-email";

const payload = {
  toEmail: "user@company.com",
  inviteUrl: "https://docs.example.com/invite?token=abc",
  role: "viewer" as const,
  expiresAt: "2026-07-09T00:00:00.000Z",
  invitedByEmail: "admin@company.com",
  invitedByName: "Admin User",
};

describe("invite email", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.RESEND_API_KEY;
    delete process.env.INVITE_EMAIL_FROM;
  });

  it("reports not configured without RESEND_API_KEY", () => {
    expect(isInviteEmailConfigured()).toBe(false);
  });

  it("builds subject and html with workspace name", () => {
    process.env.INVITE_EMAIL_WORKSPACE_NAME = "Cyware Docs";
    expect(buildInviteEmailSubject()).toContain("Cyware Docs");
    const html = buildInviteEmailHtml(payload);
    expect(html).toContain("user@company.com");
    expect(html).toContain("https://docs.example.com/invite?token=abc");
    expect(html).toContain("viewer");
    expect(html).toContain("invite?token=");
    expect(html).toContain("set up account");
    expect(html).toContain("E0000004");
    expect(html).toContain("Okta Verify");
    expect(html).not.toContain("Google");
  });

  it("builds text without Google SSO wording", () => {
    const text = buildInviteEmailText(payload);
    expect(text).toContain("user@company.com");
    expect(text).toContain("set up account");
    expect(text).toContain("E0000004");
    expect(text).not.toMatch(/Google/);
  });

  it("returns not_configured when API key missing", async () => {
    const result = await sendDocumentationInviteEmail(payload);
    expect(result).toEqual({ sent: false, reason: "not_configured" });
  });

  it("sends via Resend when configured", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.INVITE_EMAIL_FROM = "Cyware Docs <invites@cyware.com>";

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendDocumentationInviteEmail(payload);
    expect(result).toEqual({ sent: true, provider: "resend" });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.headers).toMatchObject({
      Authorization: "Bearer re_test_key",
    });
    const body = JSON.parse(String(init.body)) as { to: string[]; from: string };
    expect(body.to).toEqual(["user@company.com"]);
    expect(body.from).toContain("invites@cyware.com");
  });

  it("surfaces provider errors without throwing", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.INVITE_EMAIL_FROM = "invites@cyware.com";

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({ message: "Domain not verified" }),
      })
    );

    const result = await sendDocumentationInviteEmail(payload);
    expect(result).toEqual({
      sent: false,
      reason: "provider_error",
      message: "Domain not verified",
    });
  });
});

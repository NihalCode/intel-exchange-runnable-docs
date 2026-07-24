/**
 * reCAPTCHA verification matrix — stubs Google siteverify only.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getRecaptchaHealthStatus,
  verifyRecaptchaToken,
} from "@/lib/recaptcha/verify";

const ENV_KEYS = [
  "RECAPTCHA_SECRET_KEY",
  "NEXT_PUBLIC_RECAPTCHA_SITE_KEY",
  "RECAPTCHA_SITE_KEY",
  "RECAPTCHA_MIN_SCORE",
  "RECAPTCHA_ALLOWED_HOSTNAMES",
] as const;

describe("recaptcha verification matrix", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    for (const key of ENV_KEYS) delete process.env[key];
  });

  it("reports health without exposing secrets", () => {
    process.env.RECAPTCHA_SECRET_KEY = "secret-value-do-not-leak";
    process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY = "site-key";
    const health = getRecaptchaHealthStatus();
    expect(health.configured).toBe(true);
    expect(health.secretPresent).toBe(true);
    expect(JSON.stringify(health)).not.toContain("secret-value");
  });

  it("Ask AI / feedback fail-soft when secret missing", async () => {
    const soft = await verifyRecaptchaToken({
      token: "tok",
      expectedAction: "ask_ai_submit",
      failSoft: true,
    });
    expect(soft.ok).toBe(true);
    expect(soft.degraded).toBe(true);
    expect(soft.reason).toBe("recaptcha_not_configured");
  });

  it("public invite fail-closed when secret missing", async () => {
    const hard = await verifyRecaptchaToken({
      token: "tok",
      expectedAction: "public_invite",
      failSoft: false,
    });
    expect(hard.ok).toBe(false);
    expect(hard.degraded).toBe(false);
  });

  it("public invite fail-closed when token missing", async () => {
    process.env.RECAPTCHA_SECRET_KEY = "secret";
    const hard = await verifyRecaptchaToken({
      token: null,
      expectedAction: "public_invite",
      failSoft: false,
    });
    expect(hard.ok).toBe(false);
    expect(hard.reason).toBe("missing_token");
  });

  it("Ask AI degrades (ok) when token missing under failSoft", async () => {
    process.env.RECAPTCHA_SECRET_KEY = "secret";
    const soft = await verifyRecaptchaToken({
      token: "",
      expectedAction: "ask_ai_submit",
      failSoft: true,
    });
    expect(soft.ok).toBe(true);
    expect(soft.degraded).toBe(true);
    expect(soft.reason).toBe("missing_token");
  });

  it("rejects wrong action from Google success payload", async () => {
    process.env.RECAPTCHA_SECRET_KEY = "secret";
    process.env.RECAPTCHA_MIN_SCORE = "0.5";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          success: true,
          score: 0.9,
          action: "feedback_submit",
          hostname: "docs.example.com",
        })
      )
    );
    const result = await verifyRecaptchaToken({
      token: "valid-looking",
      expectedAction: "ask_ai_submit",
      failSoft: false,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("action_mismatch");
  });

  it("rejects low score", async () => {
    process.env.RECAPTCHA_SECRET_KEY = "secret";
    process.env.RECAPTCHA_MIN_SCORE = "0.7";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          success: true,
          score: 0.2,
          action: "ask_ai_submit",
          hostname: "docs.example.com",
        })
      )
    );
    const result = await verifyRecaptchaToken({
      token: "tok",
      expectedAction: "ask_ai_submit",
      failSoft: true,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("score_too_low");
    expect(result.degraded).toBe(false);
  });

  it("rejects hostname not on allowlist", async () => {
    process.env.RECAPTCHA_SECRET_KEY = "secret";
    process.env.RECAPTCHA_ALLOWED_HOSTNAMES = "docs.example.com,app.example.com";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          success: true,
          score: 0.95,
          action: "public_invite",
          hostname: "evil.example.net",
        })
      )
    );
    const result = await verifyRecaptchaToken({
      token: "tok",
      expectedAction: "public_invite",
      failSoft: false,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("hostname_mismatch");
  });

  it("accepts valid token for expected action and host", async () => {
    process.env.RECAPTCHA_SECRET_KEY = "secret";
    process.env.RECAPTCHA_ALLOWED_HOSTNAMES = "docs.example.com";
    process.env.RECAPTCHA_MIN_SCORE = "0.5";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          success: true,
          score: 0.88,
          action: "feedback_submit",
          hostname: "docs.example.com",
        })
      )
    );
    const result = await verifyRecaptchaToken({
      token: "tok",
      expectedAction: "feedback_submit",
      failSoft: true,
    });
    expect(result.ok).toBe(true);
    expect(result.degraded).toBe(false);
    expect(result.score).toBe(0.88);
  });

  it("network errors fail-soft for Ask AI and fail-closed for invite", async () => {
    process.env.RECAPTCHA_SECRET_KEY = "secret";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNRESET");
      })
    );
    const soft = await verifyRecaptchaToken({
      token: "tok",
      expectedAction: "ask_ai_submit",
      failSoft: true,
    });
    expect(soft.ok).toBe(true);
    expect(soft.degraded).toBe(true);

    const hard = await verifyRecaptchaToken({
      token: "tok",
      expectedAction: "public_invite",
      failSoft: false,
    });
    expect(hard.ok).toBe(false);
  });

  it("does not send secret in response objects", async () => {
    process.env.RECAPTCHA_SECRET_KEY = "super-secret-key";
    const soft = await verifyRecaptchaToken({
      token: null,
      expectedAction: "ask_ai_submit",
      failSoft: true,
    });
    expect(JSON.stringify(soft)).not.toContain("super-secret-key");
  });
});

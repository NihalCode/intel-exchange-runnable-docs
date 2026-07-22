import { describe, expect, it } from "vitest";
import {
  ASK_AI_UNAVAILABLE_MESSAGE,
  DEVELOPER_ACCESS_UNAVAILABLE_MESSAGE,
  SIGN_IN_NOT_CONFIGURED_MESSAGE,
  mapAgentApiError,
  sanitizeUserFacingMessage,
} from "../user-facing-errors";

describe("user-facing error copy", () => {
  it("never surfaces env var names from developer access errors", () => {
    const raw =
      "Developer access is not configured. Set DEVELOPER_ACCESS_TOKEN in server environment.";
    expect(mapAgentApiError(raw, 503)).toBe(ASK_AI_UNAVAILABLE_MESSAGE);
    expect(mapAgentApiError(raw, 503)).not.toMatch(/DEVELOPER_ACCESS_TOKEN/);
  });

  it("never surfaces OPENAI_API_KEY in client messages", () => {
    const raw = "OpenAI API key is missing. Add OPENAI_API_KEY to .env.local";
    expect(mapAgentApiError(raw, 503)).toBe(ASK_AI_UNAVAILABLE_MESSAGE);
    expect(mapAgentApiError(raw, 503)).not.toMatch(/OPENAI/);
  });

  it("sanitizes Auth0 env validation strings", () => {
    const raw =
      "Auth0 requires AUTH0_ISSUER_BASE_URL (or AUTH0_DOMAIN), AUTH0_CLIENT_ID, AUTH0_CLIENT_SECRET, AUTH0_SECRET, and APP_BASE_URL (or AUTH0_BASE_URL, or VERCEL_URL on Vercel).";
    expect(sanitizeUserFacingMessage(raw, SIGN_IN_NOT_CONFIGURED_MESSAGE)).toBe(
      SIGN_IN_NOT_CONFIGURED_MESSAGE
    );
  });

  it("passes through plain-language messages unchanged", () => {
    expect(
      sanitizeUserFacingMessage(
        "Your invite has expired. Ask an administrator to send a new invite.",
        SIGN_IN_NOT_CONFIGURED_MESSAGE
      )
    ).toBe("Your invite has expired. Ask an administrator to send a new invite.");
  });

  it("maps empty developer errors to unavailable copy", () => {
    expect(DEVELOPER_ACCESS_UNAVAILABLE_MESSAGE).not.toMatch(/[A-Z]{3,}_[A-Z0-9_]+/);
    expect(SIGN_IN_NOT_CONFIGURED_MESSAGE).not.toMatch(/AUTH0/);
  });
});

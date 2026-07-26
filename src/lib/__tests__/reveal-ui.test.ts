import { describe, expect, it } from "vitest";

import {
  classifyDecryptError,
  revealStateFromApiResponse,
  shouldHideRevealButton,
} from "@/lib/query-analytics/reveal-ui";

describe("reveal-ui", () => {
  it("shows exact query when API returns plaintext", () => {
    const state = revealStateFromApiResponse(200, {
      queryText: "list all indicators",
      clientIp: "203.0.113.10",
      queryStatus: "ok",
    });
    expect(state).toEqual({
      kind: "revealed",
      queryText: "list all indicators",
      clientIp: "203.0.113.10",
    });
    expect(shouldHideRevealButton(state)).toBe(true);
  });

  it("keeps reveal button and explains null ciphertext", () => {
    const state = revealStateFromApiResponse(200, {
      queryText: null,
      queryStatus: "not_captured",
      code: "NOT_CAPTURED",
    });
    expect(state.kind).toBe("unavailable");
    if (state.kind === "unavailable") {
      expect(state.reason).toBe("not_captured");
      expect(state.message).toMatch(/not stored|not captured/i);
    }
    expect(shouldHideRevealButton(state)).toBe(false);
  });

  it("maps decrypt failures without hiding the button", () => {
    const state = revealStateFromApiResponse(200, {
      queryText: null,
      queryStatus: "decrypt_failed",
      code: "DECRYPT_FAILED",
    });
    expect(state.kind).toBe("unavailable");
    expect(shouldHideRevealButton(state)).toBe(false);
  });

  it("classifyDecryptError detects missing encryption key", () => {
    expect(
      classifyDecryptError(new Error("DOCUMENTATION_CREDENTIAL_ENCRYPTION_KEY is required"))
    ).toBe("encryption_key_missing");
    expect(classifyDecryptError(new Error("bad tag"))).toBe("decrypt_failed");
  });
});

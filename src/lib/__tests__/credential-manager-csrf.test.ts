import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  anonymousViewerSession,
  isAnonymousViewerSession,
} from "@/lib/documentation-auth/anonymous-viewer";

describe("CredentialManager CSRF source", () => {
  it("fetches CSRF via getCsrfToken and uses authenticatedFetch for mutations", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/components/authentication/CredentialManager.tsx"),
      "utf8"
    );
    expect(source).toContain('from "@/lib/csrf-client"');
    expect(source).toContain("getCsrfToken");
    expect(source).toContain("authenticatedFetch");
    expect(source).toContain("prepareRetry");
    expect(source).toMatch(/\/api\/auth\/csrf|getCsrfToken\(true\)/);
    expect(source).not.toMatch(
      /fetch\(\s*["']\/api\/admin\/control-plane\/context["']/
    );
  });

  it("csrf-client recovers session via authenticatedFetch", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/lib/csrf-client.ts"),
      "utf8"
    );
    expect(source).toContain("authenticatedFetch");
    expect(source).toContain('"/api/auth/csrf"');
    expect(source).toContain("treatBare401AsSessionExpired: true");
  });
});

describe("anonymous viewer session helper", () => {
  it("identifies the synthetic Ask AI viewer session", () => {
    const session = anonymousViewerSession();
    expect(session.user.role).toBe("viewer");
    expect(isAnonymousViewerSession(session)).toBe(true);
    expect(isAnonymousViewerSession(null)).toBe(false);
  });
});

describe("AgentFeedbackControl CSRF / session recovery", () => {
  it("posts feedback via authenticatedFetch with CSRF refresh on retry", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/components/AgentFeedbackControl.tsx"),
      "utf8"
    );
    expect(source).toContain("authenticatedFetch");
    expect(source).toContain('"/api/agent/feedback"');
    expect(source).toContain("prepareRetry");
    expect(source).toContain("clearCsrfTokenCache");
    expect(source).toContain("getCsrfToken(true)");
    expect(source).toContain("redirectOnFailure: false");
    expect(source).toContain("data.error");
    expect(source).not.toMatch(
      /(?:^|\n)\s*const res = await fetch\(\s*["']\/api\/agent\/feedback["']/m
    );
  });
});

describe("AgentChat feedback visibility", () => {
  it("shows thumbs unless chat_feedback is explicitly false", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/components/AgentChat.tsx"),
      "utf8"
    );
    expect(source).toContain("AgentFeedbackControl");
    expect(source).toContain("features.chat_feedback !== false");
    expect(source).not.toContain("enabled={Boolean(features.chat_feedback)}");
  });
});

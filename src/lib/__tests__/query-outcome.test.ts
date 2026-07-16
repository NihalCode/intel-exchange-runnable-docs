import { describe, expect, it } from "vitest";

import { classifyQueryOutcome } from "@/lib/agent/query-outcome";

describe("classifyQueryOutcome", () => {
  it("maps credential gate to credential_blocked", () => {
    expect(classifyQueryOutcome({ errorCode: "PRODUCT_AUTH_REQUIRED" })).toBe(
      "credential_blocked"
    );
  });

  it("maps verified answer to answered", () => {
    expect(
      classifyQueryOutcome({
        response: {
          mode: "workflow",
          workflow: "Use GET /objects",
          confidence: 0.9,
          fallback: false,
          citations: [{ slug: "a", title: "A", url: "/docs/ctix/a" }],
          steps: [],
        },
        retrievalCount: 2,
      })
    ).toBe("answered");
  });

  it("maps clarification to clarification_required", () => {
    expect(
      classifyQueryOutcome({
        response: {
          mode: "workflow",
          workflow: "Which product?",
          confidence: 0,
          fallback: true,
          citations: [],
          steps: [],
          questions: ["CTIX or CFTR?"],
        },
      })
    ).toBe("clarification_required");
  });
});

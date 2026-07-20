import { describe, expect, it } from "vitest";

import {
  classifyQueryOutcome,
  countsTowardLogicalQueryMetrics,
  logicalQueryIdForAnalytics,
} from "@/lib/agent/query-outcome";

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

describe("logical query analytics helpers", () => {
  it("maps one turn to one logical query id", () => {
    expect(logicalQueryIdForAnalytics("turn-1", "req-9")).toBe("turn-1");
    expect(logicalQueryIdForAnalytics(undefined, "req-9")).toBe("req-9");
  });

  it("excludes cancelled from logical query metrics", () => {
    expect(countsTowardLogicalQueryMetrics("cancelled")).toBe(false);
    expect(countsTowardLogicalQueryMetrics("answered")).toBe(true);
  });
});

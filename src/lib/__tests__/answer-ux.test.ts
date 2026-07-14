import { describe, expect, it } from "vitest";
import {
  degradedRetrievalNotice,
  evidenceLabel,
  progressLabel,
} from "@/lib/agent/answer-ux";

describe("agent answer UX helpers", () => {
  it("uses coarse evidence labels instead of numeric confidence", () => {
    expect(evidenceLabel("strong_match")).toBe("Strong documentation match");
    expect(evidenceLabel("limited_evidence")).toBe("Limited documentation evidence");
    expect(evidenceLabel()).toBeUndefined();
  });

  it("only shows the local-index notice after degraded retrieval", () => {
    expect(degradedRetrievalNotice(true)).toContain("local index");
    expect(degradedRetrievalNotice(false)).toBeUndefined();
  });

  it("keeps internal routing labels out of user-visible progress", () => {
    expect(progressLabel("Finding API example code")).toBe("Finding API example code");
    expect(progressLabel("Unknown intent")).toBe("Working on your request…");
    expect(progressLabel("router diagnostics")).toBe("Working on your request…");
  });
});

import { describe, expect, it } from "vitest";
import {
  degradedRetrievalNotice,
  evidenceLabel,
  progressLabel,
  shouldShowLowConfidenceBanner,
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

  describe("shouldShowLowConfidenceBanner", () => {
    it("does not contradict strong/partial evidence when a usable step remains", () => {
      expect(
        shouldShowLowConfidenceBanner({
          fallback: true,
          retrievalEvidence: "strong_match",
          stepCount: 1,
        })
      ).toBe(false);
      expect(
        shouldShowLowConfidenceBanner({
          fallback: true,
          retrievalEvidence: "partial_match",
          stepCount: 2,
        })
      ).toBe(false);
    });

    it("shows for weak retrieval evidence", () => {
      expect(
        shouldShowLowConfidenceBanner({
          fallback: false,
          retrievalEvidence: "limited_evidence",
          stepCount: 1,
        })
      ).toBe(true);
      expect(
        shouldShowLowConfidenceBanner({
          fallback: true,
          retrievalEvidence: "no_verified_match",
          stepCount: 0,
        })
      ).toBe(true);
    });

    it("shows for true unsupported / empty fallback without usable steps", () => {
      expect(
        shouldShowLowConfidenceBanner({
          fallback: true,
          retrievalEvidence: "strong_match",
          stepCount: 0,
        })
      ).toBe(true);
      expect(
        shouldShowLowConfidenceBanner({
          fallback: true,
          stepCount: 0,
        })
      ).toBe(true);
    });

    it("hides when fallback is false and evidence is not low", () => {
      expect(
        shouldShowLowConfidenceBanner({
          fallback: false,
          retrievalEvidence: "strong_match",
          stepCount: 1,
        })
      ).toBe(false);
    });
  });
});

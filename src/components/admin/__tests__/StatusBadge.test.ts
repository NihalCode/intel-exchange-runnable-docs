import { describe, expect, it } from "vitest";

import { normalizeStatusLabel, statusBadgeClass } from "@/components/admin/ui/StatusBadge";

describe("StatusBadge helpers", () => {
  it("normalizes underscore-separated states", () => {
    expect(normalizeStatusLabel("PENDING_REVIEW")).toBe("PENDING REVIEW");
  });

  it("returns known status styles", () => {
    expect(statusBadgeClass("active")).toContain("emerald");
    expect(statusBadgeClass("rejected")).toContain("red");
  });

  it("falls back to sky for unknown statuses", () => {
    expect(statusBadgeClass("custom_state")).toContain("sky");
  });
});

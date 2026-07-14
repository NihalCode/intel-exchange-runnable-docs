import { describe, expect, it } from "vitest";
import { focusTrapNextIndex } from "@/lib/a11y";

describe("focusTrapNextIndex", () => {
  it("cycles forward from the last control to the first", () => {
    expect(focusTrapNextIndex(2, 3, false)).toBe(0);
  });

  it("cycles backward from the first control to the last", () => {
    expect(focusTrapNextIndex(0, 3, true)).toBe(2);
  });

  it("selects an edge when focus starts outside the trap", () => {
    expect(focusTrapNextIndex(-1, 3, false)).toBe(0);
    expect(focusTrapNextIndex(-1, 3, true)).toBe(2);
  });

  it("has no next target when the trap has no controls", () => {
    expect(focusTrapNextIndex(0, 0, false)).toBe(-1);
  });
});

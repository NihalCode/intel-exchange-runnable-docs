import { describe, expect, it } from "vitest";
import {
  buttonDangerClass,
  buttonGhostClass,
  buttonIconClass,
  buttonPrimaryClass,
  buttonQuietClass,
  buttonSecondaryClass,
  buttonSuccessClass,
  buttonTertiaryClass,
  buttonToolbarClass,
} from "@/components/admin/ui/tokens";

describe("Signal button token variants", () => {
  it("exports a complete action hierarchy", () => {
    expect(buttonPrimaryClass).toContain("sf-btn-primary");
    expect(buttonPrimaryClass).toContain("bg-[var(--accent-primary)]");
    expect(buttonSecondaryClass).toContain("border-[var(--border-default)]");
    expect(buttonTertiaryClass).toContain("bg-[var(--surface-muted)]");
    expect(buttonGhostClass).toContain("text-[var(--text-secondary)]");
    expect(buttonQuietClass).toContain("text-[var(--text-muted)]");
    expect(buttonDangerClass).toContain("text-red-800");
    expect(buttonSuccessClass).toContain("emerald");
    expect(buttonToolbarClass).toContain("text-xs");
    expect(buttonIconClass).toContain("h-9 w-9");
  });

  it("keeps focus-visible rings on primary actions", () => {
    expect(buttonPrimaryClass).toContain("focus-visible:ring-2");
    expect(buttonDangerClass).toContain("focus-visible:ring-2");
  });
});

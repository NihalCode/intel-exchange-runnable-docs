import { describe, it, expect } from "vitest";
import { repairCssFully, repairCssOrphans, repairAppFiles } from "../agent/repair-app";
import { validateAppFiles } from "../agent/validate-app";

const BROKEN_FROM_VERCEL = `.card {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 1.5rem;
  margin-bottom: 1.5rem;
  box-shadow: 0 1px 3px rgba(0,0,0,0.04);
}

  margin-bottom: 1.5rem;
  box-shadow: 0 1px 3px rgba(0,0,0,0.04);
}

textarea, input[type="text"] { width: 100%; }`;

const MULTIPLE_STRAY_BRACES = `body { color: #fff; }
}

.btn { padding: 1rem; }
}

.card { border: 1px solid #ccc; }`;

describe("repairCssOrphans", () => {
  it("removes orphaned declaration block from real Vercel failure", () => {
    const { code, fixed } = repairCssOrphans(BROKEN_FROM_VERCEL);
    expect(fixed).toBe(true);
    const problems = validateAppFiles([{ path: "app/globals.css", code }]);
    expect(problems).toEqual([]);
  });

  it("leaves valid CSS unchanged", () => {
    const valid = `.card { padding: 1rem; }\nbody { margin: 0; }`;
    const { code, fixed } = repairCssOrphans(valid);
    expect(fixed).toBe(false);
    expect(code).toBe(valid);
  });
});

describe("repairCssFully", () => {
  it("fixes multiple stray closing braces", () => {
    const { code, notes } = repairCssFully(MULTIPLE_STRAY_BRACES);
    expect(notes.length).toBeGreaterThan(0);
    expect(validateAppFiles([{ path: "app/globals.css", code }])).toEqual([]);
  });
});

describe("repairAppFiles", () => {
  it("repairs globals.css and passes validation at deploy", () => {
    const { files, notes } = repairAppFiles([
      { path: "app/globals.css", code: BROKEN_FROM_VERCEL },
      { path: "package.json", code: '{"name":"x"}' },
    ]);
    expect(notes.length).toBeGreaterThan(0);
    const css = files.find((f) => f.path === "app/globals.css")!.code;
    expect(validateAppFiles([{ path: "app/globals.css", code: css }])).toEqual([]);
  });
});

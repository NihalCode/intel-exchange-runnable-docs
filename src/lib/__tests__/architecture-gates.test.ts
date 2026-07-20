import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

import {
  classifySourceFile,
  extractImports,
  findCycles,
} from "../../../scripts/health/detectors.mjs";

describe("architecture gates", () => {
  it("auth env leaf modules remain a DAG (regression for TF-001)", () => {
    const graph = new Map<string, string[]>([
      ["env-values", []],
      ["base-url", ["env-values"]],
      ["auth-config-public", ["base-url", "env-values"]],
    ]);
    expect(findCycles(graph)).toHaveLength(0);

    const baseUrl = readFileSync(
      path.join(process.cwd(), "src/lib/documentation-auth/base-url.ts"),
      "utf8"
    );
    const envValues = readFileSync(
      path.join(process.cwd(), "src/lib/documentation-auth/env-values.ts"),
      "utf8"
    );
    expect(extractImports("base-url.ts", baseUrl).some((s: string) => s.includes("env-values"))).toBe(
      true
    );
    expect(extractImports("env-values.ts", envValues)).toEqual([]);
    expect(envValues).not.toMatch(/from ["'].*auth-config-public|from ["'].*base-url/);
  });

  it("classifies app-builder modules as codegen and tests as test", () => {
    expect(classifySourceFile("src/lib/agent/app-builder.ts")).toBe("codegen");
    expect(classifySourceFile("src/lib/agent/app-builder-routes.ts")).toBe("codegen");
    expect(classifySourceFile("src/lib/__tests__/security-residuals.test.ts")).toBe("test");
    expect(classifySourceFile("scripts/health/detectors.mjs")).toBe("analyzer");
  });

  it("client UI frames do not import server-only or child_process", () => {
    for (const rel of [
      "src/components/AppFrame.tsx",
      "src/components/ConditionalAppFrame.tsx",
      "src/components/admin/layout/AdminFrame.tsx",
    ]) {
      const text = readFileSync(path.join(process.cwd(), rel), "utf8");
      expect(text).not.toMatch(/server-only/);
      expect(text).not.toMatch(/child_process/);
      expect(text).not.toMatch(/from ["']@\/lib\/db\//);
    }
  });

  it("legacy Shell layout paths remain deleted", () => {
    expect(existsSync(path.join(process.cwd(), "src/components/AppShell.tsx"))).toBe(false);
    expect(existsSync(path.join(process.cwd(), "src/components/admin/shell"))).toBe(false);
  });
});

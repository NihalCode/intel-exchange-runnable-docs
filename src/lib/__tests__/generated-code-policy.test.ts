import { describe, expect, it } from "vitest";

import {
  detectDangerousAppCode,
  detectGeneratedCodeViolations,
} from "@/lib/agent/generated-code-policy";
import {
  DANGEROUS_CODE_SAMPLES,
  SAFE_IDENTIFIER_SAMPLES,
} from "@/lib/__tests__/fixtures/dangerous-code-samples";

describe("generated-code-policy", () => {
  it("returns typed violations for dangerous samples", () => {
    const v = detectGeneratedCodeViolations(DANGEROUS_CODE_SAMPLES.directEvalCall);
    expect(v[0]?.rule).toBe("global_eval_call");
    expect(detectDangerousAppCode(DANGEROUS_CODE_SAMPLES.functionConstructor)).toMatch(
      /Function/
    );
  });

  it("allows retrieval identifiers and normal functions", () => {
    for (const sample of Object.values(SAFE_IDENTIFIER_SAMPLES)) {
      expect(detectGeneratedCodeViolations(sample)).toEqual([]);
    }
  });
});

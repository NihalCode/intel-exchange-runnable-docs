import { describe, expect, it } from "vitest";
import {
  classifyResponseStyle,
  explicitSnippetRequest,
  polishWorkflowProse,
  shouldAttachWorkflowScripts,
  shouldUseEssayTemplates,
} from "../agent/response-style";
import { isHandoffQuery, isNonTechnicalQuery } from "../agent/non-technical";

describe("classifyResponseStyle", () => {
  it("quick endpoint-only → no code, compact", () => {
    const style = classifyResponseStyle("What is the HTTP method and path for listing tags?");
    expect(style.mode).toBe("quick");
    expect(style.includeCode).toBe(false);
    expect(style.showTechnicalDetails).toBe(false);
    expect(shouldAttachWorkflowScripts(style)).toBe(false);
  });

  it("explicit curl example → snippet required", () => {
    const q = "Give me a curl example for listing CTIX indicators";
    expect(explicitSnippetRequest(q)).toBe(true);
    const style = classifyResponseStyle(q);
    expect(style.mode).toBe("snippet");
    expect(style.snippet.required).toBe(true);
    expect(style.includeCode).toBe(true);
    expect(shouldAttachWorkflowScripts(style)).toBe(true);
  });

  it("troubleshooting → compact, no code", () => {
    const style = classifyResponseStyle("Why am I getting 401 on the CTIX API?");
    expect(style.mode).toBe("troubleshooting");
    expect(style.includeCode).toBe(false);
    expect(style.showTechnicalDetails).toBe(false);
  });

  it("conceptual → no code", () => {
    const style = classifyResponseStyle("What is a CQL filter in CTIX?");
    expect(style.mode).toBe("conceptual");
    expect(style.includeCode).toBe(false);
  });

  it("only the code → minimal snippet", () => {
    const style = classifyResponseStyle("Only the curl for threat-data list");
    expect(style.mode).toBe("snippet");
    expect(style.requestedDetail).toBe("minimal");
    expect(style.maxSections).toBe(1);
  });

  it("standard API question stays standard without essay", () => {
    const q = "Which endpoint searches CTIX indicators?";
    const style = classifyResponseStyle(q);
    expect(style.mode).toBe("standard");
    expect(style.includeCode).toBe(false);
    expect(shouldUseEssayTemplates(style, isNonTechnicalQuery(q), q)).toBe(false);
  });
});

describe("polishWorkflowProse", () => {
  it("strips fenced code when code is not requested", () => {
    const style = classifyResponseStyle("Which endpoint lists indicators?");
    const raw = "Use POST list.\n\n```bash\ncurl -X POST ...\n```\n\nDone.";
    expect(polishWorkflowProse(raw, style)).not.toMatch(/```/);
  });

  it("truncates quick answers", () => {
    const style = classifyResponseStyle("briefly: what is CTIX?");
    const long = Array(300).fill("word").join(" ");
    const out = polishWorkflowProse(long, style);
    expect(out.endsWith("…")).toBe(true);
  });
});

describe("shouldUseEssayTemplates", () => {
  it("non-tech detailed gets essay", () => {
    const q = "I'm not technical — explain step by step in detail how to list indicators";
    const style = classifyResponseStyle(q);
    expect(shouldUseEssayTemplates(style, isNonTechnicalQuery(q), q)).toBe(true);
  });

  it("IT handoff without snippet gets essay", () => {
    const q = "Hand this off to my IT team — list CTIX indicators from last 7 days";
    expect(isHandoffQuery(q)).toBe(true);
    const style = classifyResponseStyle(q);
    expect(style.snippet.required).toBe(false);
    expect(shouldUseEssayTemplates(style, false, q)).toBe(true);
  });

  it("give me code does not use essay (snippet instead)", () => {
    const q = "give me example code for listing indicators";
    const style = classifyResponseStyle(q);
    expect(style.mode).toBe("snippet");
    expect(shouldUseEssayTemplates(style, false, q)).toBe(false);
  });
});

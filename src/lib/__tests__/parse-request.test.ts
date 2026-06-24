import { describe, expect, it } from "vitest";
import { classifyRunKind, isPostmanPreRequestScript } from "../parse-request";

const POSTMAN_SCRIPT = `
var accessid = pm.environment.get("accessid");
var secret_key = pm.environment.get("secretkey");
pm.request.url.query.add('AccessID=' + accessid);
`;

describe("isPostmanPreRequestScript", () => {
  it("detects pm.environment and pm.request usage", () => {
    expect(isPostmanPreRequestScript(POSTMAN_SCRIPT)).toBe(true);
  });

  it("does not flag normal fetch snippets", () => {
    expect(isPostmanPreRequestScript('const res = await fetch(url);')).toBe(false);
  });
});

describe("classifyRunKind", () => {
  it("marks Postman pre-request scripts as non-runnable", () => {
    expect(classifyRunKind("javascript", POSTMAN_SCRIPT)).toBe("none");
  });

  it("still runs ordinary JavaScript snippets", () => {
    expect(classifyRunKind("javascript", 'fetch("https://example.com")')).toBe("javascript");
  });
});

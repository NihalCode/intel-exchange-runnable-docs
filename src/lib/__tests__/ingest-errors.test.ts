import { describe, expect, it } from "vitest";

import { formatIngestFailure } from "../developer/ingest-errors";

describe("formatIngestFailure", () => {
  it("explains HTTP 403 from upstream docs", () => {
    const r = formatIngestFailure({
      productId: "ctix",
      stderr: "Error: HTTP 403\n  at fetchText",
      stdout: "Fetching index: https://ctixapiv3.cyware.com/.../llms.txt",
    });
    expect(r.error).toMatch(/403/);
    expect(r.detail).toMatch(/Postman collection/);
    expect(r.detail).toMatch(/npm run ingest/);
  });

  it("does not echo raw stderr to the client", () => {
    const r = formatIngestFailure({ stderr: "Something else broke with /secret/path" });
    expect(r.error).toBe("Ingestion failed.");
    expect(r.detail).not.toContain("Something else broke");
    expect(r.detail).not.toContain("/secret/path");
    expect(r.detail).toMatch(/server logs/i);
  });
});

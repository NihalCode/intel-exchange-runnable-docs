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

  it("falls back to stderr snippet", () => {
    const r = formatIngestFailure({ stderr: "Something else broke" });
    expect(r.error).toBe("Ingestion failed.");
    expect(r.detail).toContain("Something else broke");
  });
});

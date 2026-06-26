import { describe, expect, it } from "vitest";
import { parseDateRangeFromQuery, hasDateRangePhrase } from "../agent/date-range";
import {
  filterClarifyingQuestions,
  isNonTechnicalQuery,
  buildCtixListIndicatorsAnswer,
} from "../agent/non-technical";

describe("parseDateRangeFromQuery", () => {
  it("parses last N days", () => {
    const r = parseDateRangeFromQuery("indicators from the last 7 days");
    expect(r?.days).toBe(7);
    expect(r?.phrase).toMatch(/7 days/);
    expect(r?.cqlFilter).toMatch(/ctix_created/);
  });

  it("parses last week", () => {
    expect(parseDateRangeFromQuery("data from last week")?.days).toBe(7);
  });
});

describe("filterClarifyingQuestions", () => {
  it("removes epoch questions when date range is in query", () => {
    const q = filterClarifyingQuestions(
      ["What epoch timestamp should I use?", "Which endpoint?"],
      "last 7 days of indicators",
      "threat-data/list-threat-data"
    );
    expect(q).toEqual(["Which endpoint?"]);
  });

  it("removes report/email questions for list endpoint", () => {
    const q = filterClarifyingQuestions(
      ["What is the report ID?", "What recipient emails?"],
      "list indicators",
      "threat-data/list-threat-data"
    );
    expect(q).toBeUndefined();
  });
});

describe("isNonTechnicalQuery", () => {
  it("detects plain-English requests", () => {
    expect(isNonTechnicalQuery("I'm not technical. Explain in plain English.")).toBe(true);
    expect(isNonTechnicalQuery("GET /ping technical details")).toBe(false);
  });
});

describe("buildCtixListIndicatorsAnswer", () => {
  it("uses placeholders only in code blocks", () => {
    const text = buildCtixListIndicatorsAnswer({
      query: "last 7 days indicators",
      productId: "ctix",
      dateRange: parseDateRangeFromQuery("last 7 days"),
      steps: [],
    });
    expect(text).toMatch(/<BASE_URL>/);
    expect(text).toMatch(/<ACCESS_ID>/);
    expect(text).not.toMatch(/sk-[a-z0-9]/i);
    expect(text).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  });
});

describe("hasDateRangePhrase", () => {
  it("detects casual date phrases", () => {
    expect(hasDateRangePhrase("from the last 7 days")).toBe(true);
    expect(hasDateRangePhrase("all time")).toBe(false);
  });
});

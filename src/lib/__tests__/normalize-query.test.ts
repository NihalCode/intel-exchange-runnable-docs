import { describe, it, expect } from "vitest";
import {
  canonicalizeIntent,
  expandQueryForRetrieval,
  isVagueQuery,
} from "../agent/normalize-query";
import {
  isListIndicatorsQuery,
  isPingQuery,
  isTagCreateQuery,
  isTagListVerifyQuery,
  isTagToIndicatorQuery,
} from "../agent/planner";

describe("expandQueryForRetrieval", () => {
  it("maps casual 'labels' to canonical 'tag' terms", () => {
    const expanded = expandQueryForRetrieval("show me my labels");
    expect(expanded).toContain("show me my labels");
    expect(expanded).toMatch(/\btag\b/);
    expect(expanded).toMatch(/\blist\b/);
  });

  it("maps 'bad IPs' to indicator/threat data terms", () => {
    const expanded = expandQueryForRetrieval("find the bad ips");
    expect(expanded).toMatch(/indicator/);
    expect(expanded).toMatch(/threat data|ioc_type/);
  });

  it("returns the query unchanged when no synonym matches", () => {
    const q = "zzzqqq wibble";
    expect(expandQueryForRetrieval(q)).toBe(q);
  });
});

describe("canonicalizeIntent", () => {
  it("rewrites casual nouns to canonical vocabulary", () => {
    expect(canonicalizeIntent("show me my labels")).toMatch(/\btags\b/);
    expect(canonicalizeIntent("put a label on the bad ips")).toMatch(/\bindicators\b/);
    expect(canonicalizeIntent("find the malicious stuff")).toMatch(/\bindicator\b/);
  });

  it("preserves tag names", () => {
    expect(canonicalizeIntent("a label called SampleTag9")).toContain("SampleTag9");
  });
});

describe("casual prompts route to the right intent after canonicalize", () => {
  it("'put the label X on the bad ips' is a tag-to-indicator query", () => {
    const c = canonicalizeIntent("put the label SampleTag6 on all the bad ips");
    expect(isTagToIndicatorQuery(c)).toBe(true);
  });

  it("'do I have a label called X' is a list/verify query", () => {
    const c = canonicalizeIntent("do I already have a label called SampleTag6?");
    expect(isTagListVerifyQuery(c)).toBe(true);
  });

  it("'make me a new label called X' is a create query", () => {
    const c = canonicalizeIntent("make me a new label called SampleTag9");
    expect(isTagCreateQuery(c)).toBe(true);
  });

  it("'show me all my labels' is a list/verify query", () => {
    const c = canonicalizeIntent("show me all my labels");
    expect(isTagListVerifyQuery(c)).toBe(true);
  });

  it("'show me the bad ips' is a list-indicators query", () => {
    const c = canonicalizeIntent("show me the bad ips");
    expect(isListIndicatorsQuery(c)).toBe(true);
  });

  it("connectivity questions are ping queries", () => {
    expect(isPingQuery("is the connection working?")).toBe(true);
    expect(isPingQuery("test the api")).toBe(true);
    expect(isPingQuery("ping the server")).toBe(true);
    expect(isPingQuery("is everything working")).toBe(true);
  });

  it("does not misclassify tag/indicator work as ping", () => {
    expect(isPingQuery("show me all my labels")).toBe(false);
    expect(isPingQuery("put the label SampleTag6 on the bad ips")).toBe(false);
  });
});

describe("isVagueQuery", () => {
  it("flags greetings and single words", () => {
    expect(isVagueQuery("hi")).toBe(true);
    expect(isVagueQuery("hello there")).toBe(true);
  });

  it("does not flag actionable prompts", () => {
    expect(isVagueQuery("list my tags")).toBe(false);
    expect(isVagueQuery("create a tag named test")).toBe(false);
    expect(isVagueQuery("show indicators")).toBe(false);
  });
});

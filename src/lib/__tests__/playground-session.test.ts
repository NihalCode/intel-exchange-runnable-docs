import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  loadPlaygroundDraft,
  mergeBodyText,
  mergeStringRecords,
  savePlaygroundDraft,
} from "../playground-session";

function mockSessionStorage() {
  const store = new Map<string, string>();
  const sessionStorage = {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
  };
  vi.stubGlobal("sessionStorage", sessionStorage);
  return sessionStorage;
}

describe("playground-session", () => {
  beforeEach(() => {
    mockSessionStorage().clear();
  });

  it("round-trips draft by storage id", () => {
    savePlaygroundDraft("detailed-submission/draft/create-draft-intel", {
      pathValues: { "intel-id": "abc-123" },
      bodyText: '{"title":"Test"}',
    });
    const loaded = loadPlaygroundDraft("detailed-submission/draft/create-draft-intel");
    expect(loaded?.pathValues?.["intel-id"]).toBe("abc-123");
    expect(loaded?.bodyText).toBe('{"title":"Test"}');
  });

  it("merges saved values over defaults", () => {
    expect(
      mergeStringRecords({ "intel-id": "", page: "1" }, { "intel-id": "saved-id" })
    ).toEqual({ "intel-id": "saved-id", page: "1" });
  });

  it("prefers saved body text when present", () => {
    expect(mergeBodyText('{"a":1}', '{"b":2}')).toBe('{"b":2}');
    expect(mergeBodyText('{"a":1}', undefined)).toBe('{"a":1}');
  });
});

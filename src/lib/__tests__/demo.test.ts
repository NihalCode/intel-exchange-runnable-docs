import { describe, it, expect, afterEach } from "vitest";
import {
  buildDemoResponse,
  isPlaceholderBase,
  isPlaceholderRequestUrl,
  shouldSimulateRequest,
} from "../demo";
import { DISPLAY_BASE } from "../constants";

describe("isPlaceholderBase", () => {
  it("treats DISPLAY_BASE as configured live tenant (not placeholder)", () => {
    expect(isPlaceholderBase(DISPLAY_BASE)).toBe(false);
  });
  it("treats empty as unconfigured", () => {
    expect(isPlaceholderBase("")).toBe(true);
  });
});

describe("isPlaceholderRequestUrl", () => {
  it("never treats DISPLAY_BASE as auto-simulated", () => {
    expect(
      isPlaceholderRequestUrl(`${DISPLAY_BASE}/ping/?AccessID=x`)
    ).toBe(false);
  });
});

describe("shouldSimulateRequest", () => {
  const orig = process.env.NEXT_PUBLIC_DEMO_MODE;

  afterEach(() => {
    if (orig === undefined) delete process.env.NEXT_PUBLIC_DEMO_MODE;
    else process.env.NEXT_PUBLIC_DEMO_MODE = orig;
  });

  it("does not simulate DISPLAY_BASE by default", () => {
    delete process.env.NEXT_PUBLIC_DEMO_MODE;
    expect(shouldSimulateRequest(`${DISPLAY_BASE}/ping/`)).toBe(false);
  });

  it("simulates only when explicit demo flag and NEXT_PUBLIC_DEMO_MODE=true", () => {
    process.env.NEXT_PUBLIC_DEMO_MODE = "true";
    expect(
      shouldSimulateRequest(`${DISPLAY_BASE}/ping/`, true)
    ).toBe(true);
  });

  it("does not simulate with explicit flag when demo env is off", () => {
    process.env.NEXT_PUBLIC_DEMO_MODE = "false";
    expect(
      shouldSimulateRequest(`${DISPLAY_BASE}/ping/`, true)
    ).toBe(false);
  });
});

describe("buildDemoResponse", () => {
  it("returns ping-shaped JSON for /ping/", () => {
    const res = buildDemoResponse("GET", `${DISPLAY_BASE}/ping/`);
    const body = JSON.parse(res.body);
    expect(body.status).toBe("ok");
    expect(body.demo).toBe(true);
  });
});

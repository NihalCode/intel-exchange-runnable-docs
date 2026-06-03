import { describe, it, expect, afterEach } from "vitest";
import {
  buildDemoResponse,
  isPlaceholderBase,
  isPlaceholderRequestUrl,
  shouldSimulateRequest,
} from "../demo";
import { DISPLAY_BASE } from "../constants";

describe("isPlaceholderBase", () => {
  it("treats DISPLAY_BASE as placeholder", () => {
    expect(isPlaceholderBase(DISPLAY_BASE)).toBe(true);
  });
  it("treats empty as placeholder", () => {
    expect(isPlaceholderBase("")).toBe(true);
  });
  it("does not treat real tenant URL as placeholder", () => {
    expect(isPlaceholderBase("https://myorg.cyware.com/ctixapi")).toBe(false);
  });
});

describe("isPlaceholderRequestUrl", () => {
  it("detects tenantname.com in request URL", () => {
    expect(
      isPlaceholderRequestUrl(`${DISPLAY_BASE}/ping/?AccessID=x`)
    ).toBe(true);
  });
});

describe("shouldSimulateRequest", () => {
  const orig = process.env.NEXT_PUBLIC_DEMO_MODE;

  afterEach(() => {
    if (orig === undefined) delete process.env.NEXT_PUBLIC_DEMO_MODE;
    else process.env.NEXT_PUBLIC_DEMO_MODE = orig;
  });

  it("simulates placeholder URLs when demo mode is on (default)", () => {
    delete process.env.NEXT_PUBLIC_DEMO_MODE;
    expect(
      shouldSimulateRequest(`${DISPLAY_BASE}/ping/`)
    ).toBe(true);
  });

  it("honors explicit demo flag even when env is off", () => {
    process.env.NEXT_PUBLIC_DEMO_MODE = "false";
    expect(
      shouldSimulateRequest("https://myorg.cyware.com/ctixapi/ping/", true)
    ).toBe(true);
  });

  it("still simulates placeholder host when demo env is off", () => {
    process.env.NEXT_PUBLIC_DEMO_MODE = "false";
    expect(
      shouldSimulateRequest(`${DISPLAY_BASE}/ping/`)
    ).toBe(true);
  });

  it("does not simulate real tenant URLs when demo env is off", () => {
    process.env.NEXT_PUBLIC_DEMO_MODE = "false";
    expect(
      shouldSimulateRequest("https://myorg.cyware.com/ctixapi/ping/")
    ).toBe(false);
  });
});

describe("buildDemoResponse", () => {
  it("returns ping-shaped JSON for /ping/", () => {
    const res = buildDemoResponse("GET", `${DISPLAY_BASE}/ping/`);
    const body = JSON.parse(res.body);
    expect(body.status).toBe("ok");
    expect(body.demo).toBe(true);
    expect(res.status).toBe(200);
    expect(res.statusText).toContain("demo");
  });

  it("echoes POST body in simulated response", () => {
    const res = buildDemoResponse(
      "POST",
      `${DISPLAY_BASE}/v3/intel/`,
      '{"title":"x"}'
    );
    const body = JSON.parse(res.body);
    expect(body.request_body).toEqual({ title: "x" });
    expect(body.method).toBe("POST");
  });
});

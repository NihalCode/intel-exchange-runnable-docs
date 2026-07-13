import { afterEach, describe, expect, it, vi } from "vitest";

import {
  assertAllowedProtocol,
  assertPublicHost,
  assertPublicUrl,
  isPrivateIp,
  safeFetch,
} from "@/lib/security/public-host";

describe("public host SSRF guards", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("blocks private IPv4 and IPv6 ranges", () => {
    expect(isPrivateIp("10.0.0.1")).toBe(true);
    expect(isPrivateIp("127.0.0.1")).toBe(true);
    expect(isPrivateIp("169.254.169.254")).toBe(true);
    expect(isPrivateIp("192.168.1.1")).toBe(true);
    expect(isPrivateIp("::1")).toBe(true);
    expect(isPrivateIp("8.8.8.8")).toBe(false);
  });

  it("rejects unsupported protocols and localhost hostnames", async () => {
    expect(() => assertAllowedProtocol("file:")).toThrow(/protocol/i);
    await expect(assertPublicHost("localhost")).rejects.toThrow(/blocked/i);
    await expect(assertPublicHost("app.internal")).rejects.toThrow(/blocked/i);
  });

  it("rejects literal private IPs in URLs", async () => {
    await expect(assertPublicUrl(new URL("https://127.0.0.1/"))).rejects.toThrow(
      /private/i
    );
    await expect(
      assertPublicUrl(new URL("http://169.254.169.254/latest/meta-data"))
    ).rejects.toThrow(/private/i);
  });

  it("re-validates redirect targets and blocks private redirect hops", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { location: "http://127.0.0.1/internal" },
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      safeFetch("https://example.com/start", { method: "GET" })
    ).rejects.toThrow(/private/i);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[1]?.redirect).toBe("manual");
  });

  it("follows safe redirects to public hosts", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { location: "https://example.org/final" },
        })
      )
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await safeFetch("https://example.com/start");
    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

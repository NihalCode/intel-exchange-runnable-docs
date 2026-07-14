import { afterEach, describe, expect, it, vi } from "vitest";

import {
  assertAllowedProtocol,
  assertPublicHost,
  assertPublicUrl,
  isPrivateIp,
  safeFetch,
} from "@/lib/security/public-host";

const resolvePublic = async () => [{ address: "93.184.216.34" }];

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
    expect(isPrivateIp("224.0.0.1")).toBe(true);
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

  it("rejects a DNS answer containing a private address before fetching", async () => {
    const resolve = vi.fn().mockResolvedValue([
      { address: "93.184.216.34" },
      { address: "169.254.169.254" },
    ]);
    const fetchMock = vi.fn();

    await expect(
      safeFetch("https://api.cyware.com/ctixapi", { resolve, fetch: fetchMock })
    ).rejects.toThrow(/private/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("re-validates redirect targets and blocks private redirect hops", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(null, {
        status: 302,
        headers: { location: "http://127.0.0.1/internal" },
      })
    );

    await expect(
      safeFetch("https://api.cyware.com/ctixapi/start", {
        method: "GET",
        resolve: resolvePublic,
        fetch: fetchMock,
      })
    ).rejects.toThrow(/private/i);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[1]?.redirect).toBe("manual");
  });

  it("re-resolves same-host redirects to catch DNS rebinding", async () => {
    const resolve = vi
      .fn()
      .mockResolvedValueOnce([{ address: "93.184.216.34" }])
      .mockResolvedValueOnce([{ address: "10.0.0.7" }]);
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(null, { status: 302, headers: { location: "/ctixapi/next" } })
    );

    await expect(
      safeFetch("https://api.cyware.com/ctixapi/start", { resolve, fetch: fetchMock })
    ).rejects.toThrow(/private/i);
    expect(resolve).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledTimes(1);
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

    const response = await safeFetch("https://api.cyware.com/ctixapi/start", {
      resolve: resolvePublic,
      fetch: fetchMock,
    });
    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

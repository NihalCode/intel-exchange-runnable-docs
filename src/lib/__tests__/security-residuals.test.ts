import { afterEach, describe, expect, it, vi } from "vitest";

import { detectDangerousAppCode } from "@/lib/agent/validate-app";
import { trustedCsrfOrigins } from "@/lib/enterprise/csrf";
import { isPrivateIp } from "@/lib/security/public-host";
import { safeFetchAllowlisted } from "@/lib/security/safe-fetch-allowlisted";
import { secretsEqual } from "@/lib/security/secrets-equal";

describe("residuals — IPv4-mapped IPv6 SSRF", () => {
  it("treats IPv4-mapped loopback and link-local as private", () => {
    expect(isPrivateIp("::ffff:127.0.0.1")).toBe(true);
    expect(isPrivateIp("::ffff:7f00:1")).toBe(true);
    expect(isPrivateIp("::ffff:a00:1")).toBe(true); // 10.0.0.1
    expect(isPrivateIp("::ffff:169.254.169.254")).toBe(true);
    expect(isPrivateIp("::ffff:808:808")).toBe(false); // 8.8.8.8
  });
});

describe("residuals — allowlisted redirect SSRF", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("blocks redirects that leave the product allowlist", async () => {
    const resolve = vi.fn().mockResolvedValue([{ address: "93.184.216.34" }]);
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(null, {
        status: 302,
        headers: { location: "https://example.org/exfil" },
      })
    );

    await expect(
      safeFetchAllowlisted("https://cs-testv2.cyware.com/ctixapi/start", {
        resolve,
        fetch: fetchMock,
        assertDestination: (url) => url.hostname.endsWith("cyware.com"),
      })
    ).rejects.toThrow(/allowlist/i);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("allows redirects that stay on the allowlist", async () => {
    const resolve = vi.fn().mockResolvedValue([{ address: "93.184.216.34" }]);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { location: "https://cs-testv2.cyware.com/ctixapi/next" },
        })
      )
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));

    const response = await safeFetchAllowlisted(
      "https://cs-testv2.cyware.com/ctixapi/start",
      {
        resolve,
        fetch: fetchMock,
        assertDestination: (url) => url.hostname.endsWith("cyware.com"),
      }
    );
    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("residuals — trusted CSRF origins", () => {
  afterEach(() => {
    delete process.env.APP_BASE_URL;
    delete process.env.AUTH0_BASE_URL;
    delete process.env.VERCEL_URL;
    delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
  });

  it("includes request origin and APP_BASE_URL, not raw X-Forwarded-Host", () => {
    process.env.APP_BASE_URL = "https://docs.example.com";
    const request = new Request("https://docs.example.com/api/x", {
      headers: { "x-forwarded-host": "evil.attacker.com" },
    });
    const origins = trustedCsrfOrigins(request);
    expect(origins).toContain("https://docs.example.com");
    expect(origins).not.toContain("https://evil.attacker.com");
  });
});

describe("residuals — secretsEqual", () => {
  it("accepts equal secrets and rejects mismatches without throwing", () => {
    expect(secretsEqual("abc", "abc")).toBe(true);
    expect(secretsEqual("abc", "abd")).toBe(false);
    expect(secretsEqual("abc", "ab")).toBe(false);
  });
});

describe("residuals — detectDangerousAppCode", () => {
  it("bans eval, Function, child_process, and privileged env reads", () => {
    expect(detectDangerousAppCode("eval(x)")).toMatch(/eval/i);
    expect(detectDangerousAppCode("new Function('return 1')")).toMatch(/Function/i);
    expect(detectDangerousAppCode("require('child_process')")).toMatch(/child_process/i);
    expect(detectDangerousAppCode("process.env.OPENAI_API_KEY")).toMatch(/process\.env/i);
    expect(detectDangerousAppCode("const x = 1")).toBeNull();
  });
});

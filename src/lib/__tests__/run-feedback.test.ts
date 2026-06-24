import { describe, expect, it } from "vitest";
import {
  isCloudflareAccessBlock,
  isTemplateTenantBase,
  responseRunHint,
} from "../run-feedback";

describe("run-feedback", () => {
  it("detects placeholder tenant base URLs", () => {
    expect(isTemplateTenantBase("https://tenantname.cyware.com/cftrapi")).toBe(true);
    expect(isTemplateTenantBase("https://cftrapi.cyware.com")).toBe(false);
    expect(isTemplateTenantBase("https://mycompany.cyware.com/cftrapi")).toBe(false);
  });

  it("detects Cloudflare Access HTML responses", () => {
    expect(
      isCloudflareAccessBlock(403, "<title>Error &middot; Cloudflare Access</title>")
    ).toBe(true);
    expect(isCloudflareAccessBlock(401, '{"detail":"Invalid signature"}')).toBe(false);
  });

  it("prioritizes tenant URL hint over Cloudflare hint", () => {
    const body = "<title>Error &middot; Cloudflare Access</title>";
    expect(responseRunHint(403, body, "https://tenantname.cyware.com/cftrapi")).toMatch(
      /API Settings/
    );
  });
});

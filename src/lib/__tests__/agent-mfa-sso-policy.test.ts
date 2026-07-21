import { afterEach, describe, expect, it } from "vitest";

import {
  agentRequiresProductCredentials,
  canUseAgentWithoutStoredProductSecrets,
} from "@/lib/documentation-credentials/agent-access-policy";
import {
  adminMfaStepUpHref,
  auth0StepUpLoginPath,
  MFA_ACR_VALUES,
} from "@/lib/enterprise/mfa-step-up";

describe("mfa step-up URLs", () => {
  it("requests forced re-auth with MFA ACR on login", () => {
    const path = auth0StepUpLoginPath("/admin");
    expect(path.startsWith("/auth/login?")).toBe(true);
    expect(path).toContain("prompt=login");
    expect(path).toContain("max_age=0");
    expect(path).toContain(`acr_values=${encodeURIComponent(MFA_ACR_VALUES)}`);
    expect(path).toContain(`returnTo=${encodeURIComponent("/admin")}`);
  });

  it("logout then step-up login to break password-only SSO loops", () => {
    const href = adminMfaStepUpHref("/admin");
    expect(href.startsWith("/auth/logout?returnTo=")).toBe(true);
    const returnTo = decodeURIComponent(href.split("returnTo=")[1]!);
    expect(returnTo).toContain("/auth/login?");
    expect(returnTo).toContain("prompt=login");
  });
});

describe("agent credential requirement policy", () => {
  const original = process.env.AGENT_REQUIRE_PRODUCT_CREDENTIALS;
  const originalProduct = process.env.APP_PRODUCT_ID;

  afterEach(() => {
    if (original === undefined) delete process.env.AGENT_REQUIRE_PRODUCT_CREDENTIALS;
    else process.env.AGENT_REQUIRE_PRODUCT_CREDENTIALS = original;
    if (originalProduct === undefined) delete process.env.APP_PRODUCT_ID;
    else process.env.APP_PRODUCT_ID = originalProduct;
  });

  it("honors AGENT_REQUIRE_PRODUCT_CREDENTIALS=false without DB", async () => {
    process.env.AGENT_REQUIRE_PRODUCT_CREDENTIALS = "false";
    await expect(
      agentRequiresProductCredentials({ organizationId: "org", role: "admin" })
    ).resolves.toBe(false);
  });

  it("allows Ask AI when credentials are not required", async () => {
    process.env.AGENT_REQUIRE_PRODUCT_CREDENTIALS = "false";
    delete process.env.APP_PRODUCT_ID;
    const access = await canUseAgentWithoutStoredProductSecrets({
      organizationId: "org-missing",
      userId: "user-missing",
      role: "viewer",
    });
    expect(access.allowed).toBe(true);
  });

  it("allows Ask AI on host-pinned product even when credentials required", async () => {
    process.env.AGENT_REQUIRE_PRODUCT_CREDENTIALS = "true";
    process.env.APP_PRODUCT_ID = "csap";
    const access = await canUseAgentWithoutStoredProductSecrets({
      organizationId: "org-missing",
      userId: "user-missing",
      role: "viewer",
    });
    expect(access.allowed).toBe(true);
    expect(access.pinnedProductId).toBe("csap");
  });
});

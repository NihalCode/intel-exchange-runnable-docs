import { describe, expect, it } from "vitest";

import {
  buildConnectivityUrl,
  listConnectivityProbeUrls,
} from "@/lib/documentation-credentials/connectivity";
import {
  disallowedBaseUrlMessage,
  isAllowedBaseUrl,
  normalizeProductBaseUrl,
} from "@/lib/products/registry";

describe("buildConnectivityUrl", () => {
  it("builds CTIX ping under tenant /ctixapi", () => {
    expect(
      buildConnectivityUrl("ctix", "https://cs-testv2.cyware.com/ctixapi").href
    ).toBe("https://cs-testv2.cyware.com/ctixapi/ping/");
    expect(
      buildConnectivityUrl("ctix", "https://cs-testv2.cyware.com/ctixapi/").href
    ).toBe("https://cs-testv2.cyware.com/ctixapi/ping/");
  });

  it("strips extra CTIX path segments after /ctixapi", () => {
    expect(
      buildConnectivityUrl("ctix", "https://cs-testv2.cyware.com/ctixapi/v3").href
    ).toBe("https://cs-testv2.cyware.com/ctixapi/ping/");
  });

  it("builds CFTR connectivity for tenant /cftrapi without doubling", () => {
    expect(
      buildConnectivityUrl("cftr", "https://tenant.cyware.com/cftrapi").href
    ).toBe("https://tenant.cyware.com/cftrapi/openapi/test-connectivity/");
    expect(
      buildConnectivityUrl("cftr", "https://tenant.cyware.com/cftrapi/openapi").href
    ).toBe("https://tenant.cyware.com/cftrapi/openapi/test-connectivity/");
  });

  it("builds CSAP connectivity without doubling /csap", () => {
    expect(buildConnectivityUrl("csap", "https://tenant.cyware.com/csap").href).toBe(
      "https://tenant.cyware.com/csap/v1/test_connectivity/"
    );
    expect(buildConnectivityUrl("csap", "https://tenant.cyware.com/csap/").href).toBe(
      "https://tenant.cyware.com/csap/v1/test_connectivity/"
    );
    expect(buildConnectivityUrl("csap", "https://csapapi.cyware.com").href).toBe(
      "https://csapapi.cyware.com/csap/v1/test_connectivity/"
    );
  });

  it("builds Orchestrate connectivity for soarapi and co tenant shapes", () => {
    expect(
      buildConnectivityUrl(
        "orchestrate",
        "https://cs-test.cyware.com/soarapi/openapi/"
      ).href
    ).toBe("https://cs-test.cyware.com/soarapi/openapi/v1/test_connectivity/");

    expect(
      buildConnectivityUrl("orchestrate", "https://cs-test.cyware.com/soarapi").href
    ).toBe("https://cs-test.cyware.com/soarapi/openapi/v1/test_connectivity/");

    expect(
      buildConnectivityUrl("orchestrate", "https://cs-test.cyware.com/co").href
    ).toBe("https://cs-test.cyware.com/co/v1/test_connectivity/");

    expect(
      buildConnectivityUrl("orchestrate", "https://orchestrateapi.cyware.com").href
    ).toBe("https://orchestrateapi.cyware.com/v1/test_connectivity/");
  });
});

describe("listConnectivityProbeUrls", () => {
  it("includes alternate Orchestrate path shapes for soarapi", () => {
    const urls = listConnectivityProbeUrls(
      "orchestrate",
      "https://cs-test.cyware.com/soarapi"
    ).map((u) => u.pathname);
    expect(urls).toContain("/soarapi/openapi/v1/test_connectivity/");
    expect(urls).toContain("/soarapi/v1/test_connectivity/");
  });

  it("does not double CSAP or CFTR product prefixes", () => {
    expect(
      listConnectivityProbeUrls("csap", "https://tenant.cyware.com/csap").map(
        (u) => u.href
      )
    ).toEqual(["https://tenant.cyware.com/csap/v1/test_connectivity/"]);
    expect(
      listConnectivityProbeUrls("cftr", "https://tenant.cyware.com/cftrapi").map(
        (u) => u.href
      )
    ).toEqual(["https://tenant.cyware.com/cftrapi/openapi/test-connectivity/"]);
  });

  it("probes CSAP under /csap when given a bare tenant-like /api path", () => {
    const urls = listConnectivityProbeUrls(
      "csap",
      "https://cs-test.cyware.com/api"
    ).map((u) => u.pathname);
    expect(urls).toContain("/api/csap/v1/test_connectivity/");
    expect(urls).toContain("/api/v1/test_connectivity/");
  });
});

describe("isAllowedBaseUrl product bases", () => {
  it("allows soarapi and co tenant Open API bases", () => {
    expect(
      isAllowedBaseUrl("orchestrate", "https://cs-test.cyware.com/soarapi/openapi")
    ).toBe(true);
    expect(isAllowedBaseUrl("orchestrate", "https://cs-test.cyware.com/soarapi")).toBe(
      true
    );
    expect(isAllowedBaseUrl("orchestrate", "https://cs-test.cyware.com/co")).toBe(true);
    expect(isAllowedBaseUrl("orchestrate", "https://orchestrateapi.cyware.com")).toBe(
      true
    );
    expect(isAllowedBaseUrl("orchestrate", "https://evil.example.com/soarapi")).toBe(
      false
    );
  });

  it("allows CSAP tenant /csap and csapapi docs-host bases", () => {
    expect(isAllowedBaseUrl("csap", "https://tenant.cyware.com/csap")).toBe(true);
    expect(isAllowedBaseUrl("csap", "https://cs-test.cyware.com/csap")).toBe(true);
    expect(isAllowedBaseUrl("csap", "https://cs-test.cyware.com/csap/")).toBe(true);
    expect(isAllowedBaseUrl("csap", "https://csapapi.cyware.com")).toBe(true);
  });

  it("rejects bare /api as a CSAP Open API base until normalized", () => {
    expect(isAllowedBaseUrl("csap", "https://cs-test.cyware.com/api")).toBe(false);
    expect(isAllowedBaseUrl("csap", "https://cs-test.cyware.com/api/")).toBe(false);
  });

  it("normalizes CSAP tenant …/api to …/csap", () => {
    expect(normalizeProductBaseUrl("csap", "https://cs-test.cyware.com/api")).toBe(
      "https://cs-test.cyware.com/csap"
    );
    expect(normalizeProductBaseUrl("csap", "https://cs-test.cyware.com/api/")).toBe(
      "https://cs-test.cyware.com/csap"
    );
    expect(
      isAllowedBaseUrl(
        "csap",
        normalizeProductBaseUrl("csap", "https://cs-test.cyware.com/api/")
      )
    ).toBe(true);
    expect(normalizeProductBaseUrl("csap", "https://cs-test.cyware.com/csap")).toBe(
      "https://cs-test.cyware.com/csap"
    );
  });

  it("rejects CFTR docs host — tenant /cftrapi only", () => {
    expect(isAllowedBaseUrl("cftr", "https://cftrapi.cyware.com")).toBe(false);
    expect(isAllowedBaseUrl("cftr", "https://tenant.cyware.com/cftrapi")).toBe(true);
    expect(isAllowedBaseUrl("cftr", "https://cs-test.cyware.com/cftrapi")).toBe(true);
  });
});

describe("disallowedBaseUrlMessage", () => {
  it("gives CSAP-specific guidance and never mentions Orchestrate paths", () => {
    const msg = disallowedBaseUrlMessage("csap");
    expect(msg).toMatch(/CSAP/i);
    expect(msg).toMatch(/\/csap/);
    expect(msg).toMatch(/csapapi\.cyware\.com/);
    expect(msg).not.toMatch(/Orchestrate/i);
    expect(msg).not.toMatch(/soarapi/);
    expect(msg).not.toMatch(/\/co\b/);
  });

  it("gives CFTR-specific guidance and never mentions Orchestrate paths", () => {
    const msg = disallowedBaseUrlMessage("cftr");
    expect(msg).toMatch(/CFTR/i);
    expect(msg).toMatch(/\/cftrapi/);
    expect(msg).toMatch(/cftrapi\.cyware\.com/);
    expect(msg).not.toMatch(/Orchestrate/i);
    expect(msg).not.toMatch(/soarapi/);
  });

  it("gives Orchestrate-specific guidance for Orchestrate only", () => {
    const msg = disallowedBaseUrlMessage("orchestrate");
    expect(msg).toMatch(/Orchestrate/i);
    expect(msg).toMatch(/soarapi/);
    expect(msg).not.toMatch(/\/csap/);
    expect(msg).not.toMatch(/\/cftrapi/);
  });

  it("gives CTIX-specific guidance", () => {
    const msg = disallowedBaseUrlMessage("ctix");
    expect(msg).toMatch(/CTIX/i);
    expect(msg).toMatch(/\/ctixapi/);
    expect(msg).not.toMatch(/Orchestrate/i);
  });
});

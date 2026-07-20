import { describe, expect, it } from "vitest";

import { buildConnectivityUrl } from "@/lib/documentation-credentials/connectivity";
import { isAllowedBaseUrl } from "@/lib/products/registry";

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

  it("builds CFTR connectivity for tenant and docs-host bases", () => {
    expect(
      buildConnectivityUrl("cftr", "https://tenant.cyware.com/cftrapi").href
    ).toBe("https://tenant.cyware.com/cftrapi/openapi/test-connectivity/");
    expect(buildConnectivityUrl("cftr", "https://cftrapi.cyware.com").href).toBe(
      "https://cftrapi.cyware.com/cftrapi/openapi/test-connectivity/"
    );
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

describe("isAllowedBaseUrl Orchestrate soarapi", () => {
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

  it("allows CSAP tenant and docs-host bases", () => {
    expect(isAllowedBaseUrl("csap", "https://tenant.cyware.com/csap")).toBe(true);
    expect(isAllowedBaseUrl("csap", "https://csapapi.cyware.com")).toBe(true);
  });
});

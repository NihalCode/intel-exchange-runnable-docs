import { describe, expect, it } from "vitest";
import {
  connectionRequiredMessage,
  hasOpenApiCredentials,
  hasProductCredentials,
  serverAuthRequiredMessage,
  urlHasOpenApiAuth,
} from "../api-credentials";

describe("hasProductCredentials", () => {
  it("checks required fields per product", () => {
    const get = (key: string) => (key === "accessid" ? "id" : key === "secretkey" ? "sk" : "");
    expect(hasProductCredentials("ctix", get)).toBe(true);
    expect(hasProductCredentials("csap", () => "")).toBe(false);
  });
});

describe("connectionRequiredMessage product-aware", () => {
  it("names the product in the message", () => {
    expect(connectionRequiredMessage("GET", "csap")).toMatch(/CSAP/i);
  });
});

describe("hasOpenApiCredentials", () => {
  it("requires both access id and secret key", () => {
    expect(hasOpenApiCredentials("", "")).toBe(false);
    expect(hasOpenApiCredentials("id", "")).toBe(false);
    expect(hasOpenApiCredentials("", "secret")).toBe(false);
    expect(hasOpenApiCredentials("  ", "secret")).toBe(false);
    expect(hasOpenApiCredentials("id", "secret")).toBe(true);
  });
});

describe("urlHasOpenApiAuth", () => {
  it("detects Open API query params", () => {
    const url =
      "https://tenant.cyware.com/ctixapi/tags/?AccessID=abc&Signature=sig&Expires=9999999999";
    expect(urlHasOpenApiAuth(url)).toBe(true);
  });

  it("rejects missing auth params", () => {
    expect(urlHasOpenApiAuth("https://tenant.cyware.com/ctixapi/tags/")).toBe(false);
    expect(
      urlHasOpenApiAuth("https://tenant.cyware.com/ctixapi/tags/?AccessID=abc")
    ).toBe(false);
  });
});

describe("connectionRequiredMessage", () => {
  it("mentions data changes for mutating methods", () => {
    expect(connectionRequiredMessage("POST")).toMatch(/changes data/i);
    expect(connectionRequiredMessage("GET")).not.toMatch(/changes data/i);
  });
});

describe("serverAuthRequiredMessage", () => {
  it("mentions mutating requirements for write methods", () => {
    expect(serverAuthRequiredMessage("DELETE")).toMatch(/Mutating/i);
    expect(serverAuthRequiredMessage("GET")).toMatch(/Live API/i);
  });
});

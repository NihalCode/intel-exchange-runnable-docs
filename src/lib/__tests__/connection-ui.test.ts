import { describe, expect, it } from "vitest";
import { productConnectionUi } from "../products/connection-ui";

describe("productConnectionUi", () => {
  it("all four products use Open API Access ID + Secret Key fields", () => {
    for (const id of ["ctix", "csap", "orchestrate", "cftr"] as const) {
      const ui = productConnectionUi(id);
      expect(ui.usesOpenApi).toBe(true);
      expect(ui.fields.map((f) => f.kind)).toEqual(["access-id", "secret-key"]);
      expect(ui.fields.every((f) => f.required)).toBe(true);
    }
  });

  it("uses product-specific labels and credential sources", () => {
    expect(productConnectionUi("ctix").credentialSource).toMatch(/CTIX|Admin/i);
    expect(productConnectionUi("csap").credentialSource).toMatch(/Analyst Portal/i);
    expect(productConnectionUi("orchestrate").credentialSource).toMatch(/Orchestrate/i);
    expect(productConnectionUi("cftr").credentialSource).toMatch(/CFTR/i);
  });

  it("CFTR footnote clarifies Open API not standalone API key header", () => {
    expect(productConnectionUi("cftr").footnote).toMatch(/not a standalone API key/i);
  });
});

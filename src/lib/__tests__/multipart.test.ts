import { describe, it, expect } from "vitest";
import importIntelPage from "../../content/pages/import-intel__import-intel.json";
import type { EndpointPage } from "../types";
import {
  buildMultipartParts,
  endpointUsesMultipart,
  formFieldsFromBody,
  validateMultipartForRun,
} from "../multipart";
import { buildRunnableRequest } from "../snippets";

describe("multipart", () => {
  it("detects Import Intel as multipart", () => {
    expect(endpointUsesMultipart(importIntelPage as unknown as EndpointPage)).toBe(true);
  });

  it("builds form fields from Import Intel body", () => {
    const fields = formFieldsFromBody((importIntelPage as unknown as EndpointPage).request.body);
    expect(fields.map((f) => f.name)).toEqual(["file", "collection_id"]);
    expect(fields.find((f) => f.name === "file")?.kind).toBe("file");
  });

  it("buildRunnableRequest marks multipart and omits JSON body", () => {
    const req = buildRunnableRequest(importIntelPage as unknown as EndpointPage);
    expect(req.multipart).toBe(true);
    expect(req.body).toBeUndefined();
    expect(req.formFields?.length).toBe(2);
    expect(req.headers.some((h) => h.name.toLowerCase() === "content-type")).toBe(false);
  });

  it("buildMultipartParts includes file and text fields", () => {
    const fields = formFieldsFromBody((importIntelPage as unknown as EndpointPage).request.body);
    const file = new File(['{"type":"bundle"}'], "test.json", { type: "application/json" });
    const parts = buildMultipartParts(
      fields,
      { collection_id: "abc-123" },
      { file }
    );
    expect(parts).toHaveLength(2);
    expect(parts[0]).toMatchObject({ name: "file", kind: "file", filename: "test.json" });
    expect(parts[1]).toMatchObject({ name: "collection_id", kind: "text", value: "abc-123" });
  });

  it("validateMultipartForRun requires file or text when file field exists", () => {
    const fields = formFieldsFromBody((importIntelPage as unknown as EndpointPage).request.body);
    expect(validateMultipartForRun(fields, {}, {})).toMatch(/Select a file/);
    expect(validateMultipartForRun(fields, { collection_id: "x" }, {})).toBeNull();
  });
});

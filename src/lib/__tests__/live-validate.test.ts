import { describe, expect, it, afterEach } from "vitest";
import { canRunLiveValidation } from "../developer/live-validate";

describe("canRunLiveValidation", () => {
  const origToken = process.env.DEVELOPER_ACCESS_TOKEN;
  const origExec = process.env.ENABLE_API_EXECUTION;
  const origBase = process.env.DEV_CYWARE_CTIX_BASE_URL;

  afterEach(() => {
    if (origToken === undefined) delete process.env.DEVELOPER_ACCESS_TOKEN;
    else process.env.DEVELOPER_ACCESS_TOKEN = origToken;
    if (origExec === undefined) delete process.env.ENABLE_API_EXECUTION;
    else process.env.ENABLE_API_EXECUTION = origExec;
    if (origBase === undefined) delete process.env.DEV_CYWARE_CTIX_BASE_URL;
    else process.env.DEV_CYWARE_CTIX_BASE_URL = origBase;
  });

  it("blocks live validation without ENABLE_API_EXECUTION", () => {
    process.env.DEVELOPER_ACCESS_TOKEN = "tok";
    delete process.env.ENABLE_API_EXECUTION;
    expect(canRunLiveValidation().allowed).toBe(false);
    expect(canRunLiveValidation().blockers.join(" ")).toMatch(/ENABLE_API_EXECUTION/);
  });

  it("blocks live validation for product without credentials", () => {
    process.env.DEVELOPER_ACCESS_TOKEN = "tok";
    process.env.ENABLE_API_EXECUTION = "true";
    delete process.env.DEV_CYWARE_CTIX_BASE_URL;
    delete process.env.DEV_CYWARE_CTIX_ACCESS_ID;
    delete process.env.DEV_CYWARE_CTIX_SECRET_KEY;
    expect(canRunLiveValidation("ctix").allowed).toBe(false);
  });
});

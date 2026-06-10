import { describe, it, expect } from "vitest";
import {
  buildVercelEnvPayload,
  validateCywareEnvVars,
} from "../agent/vercel-env";

describe("validateCywareEnvVars", () => {
  it("accepts complete credentials", () => {
    expect(
      validateCywareEnvVars({
        CYWARE_BASE_URL: "https://tenant.cyware.com/ctixapi",
        CYWARE_ACCESS_ID: "abc",
        CYWARE_SECRET_KEY: "secret",
      })
    ).toBeNull();
  });

  it("rejects missing secret key", () => {
    expect(
      validateCywareEnvVars({
        CYWARE_BASE_URL: "https://tenant.cyware.com/ctixapi",
        CYWARE_ACCESS_ID: "abc",
        CYWARE_SECRET_KEY: "",
      })
    ).toContain("CYWARE_SECRET_KEY");
  });
});

describe("buildVercelEnvPayload", () => {
  it("builds upsert payload for all three Cyware vars", () => {
    const payload = buildVercelEnvPayload({
      CYWARE_BASE_URL: "https://tenant.cyware.com/ctixapi",
      CYWARE_ACCESS_ID: "id-1",
      CYWARE_SECRET_KEY: "sk-1",
    });
    expect(payload).toHaveLength(3);
    expect(payload.find((p) => p.key === "CYWARE_SECRET_KEY")?.type).toBe("sensitive");
    expect(payload.every((p) => p.target.includes("production"))).toBe(true);
  });
});

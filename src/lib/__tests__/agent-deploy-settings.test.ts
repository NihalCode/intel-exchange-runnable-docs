import { describe, it, expect, beforeEach } from "vitest";
import {
  clearDeploySettings,
  loadDeploySettings,
  saveDeploySettings,
  hasDeploySettings,
} from "../agent/deploy-settings-client";

describe("deploy-settings-client", () => {
  beforeEach(() => clearDeploySettings());

  it("starts empty", () => {
    expect(loadDeploySettings().vercelToken).toBe("");
    expect(hasDeploySettings()).toBe(false);
  });

  it("persists values in memory across loads", () => {
    saveDeploySettings({
      vercelToken: "vercel_abc",
      baseUrl: "https://tenant.cyware.com/ctixapi",
      accessId: "id1",
      secretKey: "secret1",
    });
    const s = loadDeploySettings();
    expect(s.vercelToken).toBe("vercel_abc");
    expect(s.secretKey).toBe("secret1");
    expect(hasDeploySettings()).toBe(true);
  });

  it("merges partial updates", () => {
    saveDeploySettings({ vercelToken: "vercel_x" });
    saveDeploySettings({ baseUrl: "https://example.com" });
    expect(loadDeploySettings()).toEqual({
      vercelToken: "vercel_x",
      baseUrl: "https://example.com",
      accessId: "",
      secretKey: "",
    });
  });
});

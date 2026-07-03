import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";

import { GET as authDiagnosticsGet } from "@/app/api/admin/auth-diagnostics/route";
import {
  resetDatabaseConnection,
  setTestDatabasePath,
} from "@/lib/db/client";
import { clearAllDocumentationAuthData } from "@/lib/db/repository";

vi.mock("@/lib/documentation-auth/config", () => ({
  isAuthEnabled: () => true,
  isAuthDisabled: () => false,
  isTestAuthMode: () => false,
}));

describe("auth-diagnostics API", () => {
  let dbPath: string;

  beforeEach(async () => {
    dbPath = path.join(os.tmpdir(), `auth-diag-api-${Date.now()}.db`);
    setTestDatabasePath(dbPath);
    resetDatabaseConnection();
    await clearAllDocumentationAuthData();
  });

  afterEach(() => {
    resetDatabaseConnection();
    setTestDatabasePath(null);
    try {
      fs.unlinkSync(dbPath);
    } catch {
      /* ignore */
    }
  });

  it("returns 401 without authenticated session when auth is enabled", async () => {
    const response = await authDiagnosticsGet(
      new Request("http://localhost/api/admin/auth-diagnostics") as import("next/server").NextRequest
    );
    expect(response.status).toBe(401);
  });
});

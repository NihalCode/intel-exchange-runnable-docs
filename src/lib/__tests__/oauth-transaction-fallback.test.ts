import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const runExecute = vi.fn();
const runQueryOne = vi.fn();
const isPostgresConfigured = vi.fn();

vi.mock("@/lib/db/client", () => ({
  runExecute: (...args: unknown[]) => runExecute(...args),
  runQueryOne: (...args: unknown[]) => runQueryOne(...args),
  isPostgresConfigured: () => isPostgresConfigured(),
}));

import { saveOAuthTransaction } from "@/lib/documentation-auth/oauth-transaction-store";

describe("saveOAuthTransaction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("does not throw when Postgres is configured but unreachable", async () => {
    isPostgresConfigured.mockReturnValue(true);
    runExecute.mockRejectedValue(new Error("connection refused"));

    await expect(
      saveOAuthTransaction({
        state: "state-fallback",
        cookieName: "__txn_",
        cookieValue: "cookie-value",
      })
    ).resolves.toBeUndefined();
  });
});

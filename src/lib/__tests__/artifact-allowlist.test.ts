import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";

const root = process.cwd();

describe("artifact allowlist / secret scan", () => {
  it("documents forbidden globs and sanitized env example", () => {
    const allowlistPath = join(root, "scripts/security/artifact-allowlist.json");
    expect(existsSync(allowlistPath)).toBe(true);
    const allowlist = JSON.parse(readFileSync(allowlistPath, "utf8"));
    expect(allowlist.forbiddenGlobs).toEqual(
      expect.arrayContaining(["node_modules/**", ".next/**", ".env.*"])
    );
    expect(existsSync(join(root, ".env.example"))).toBe(true);
  });

  it("git-tracked tree contains no sensitive env or database files", () => {
    const tracked = execSync("git ls-files -z", { encoding: "buffer" })
      .toString("utf8")
      .split("\0")
      .filter(Boolean);

    const forbidden = tracked.filter((file) => {
      const base = file.split(/[/\\]/).pop() ?? file;
      if (file === ".env.example" || base === ".env.example") return false;
      return (
        /^\.env/i.test(base) ||
        /\.db(-journal)?$/i.test(base) ||
        base === "CYWARE KEYS.txt" ||
        /\.(pem|p12|pfx)$/i.test(base)
      );
    });

    expect(forbidden).toEqual([]);
  });
});

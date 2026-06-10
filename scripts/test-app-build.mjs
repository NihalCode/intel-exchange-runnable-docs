// Generates the phishing analyzer app exactly as the agent does,
// writes it to a temp dir, and runs npm install + next build on it.
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { execSync } from "node:child_process";

// Build the blueprint via the dev server API (same code path as production)
const res = await fetch("http://localhost:3000/api/agent", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    query: "Build a phishing email analyzer app",
    mode: "app",
    language: "python",
  }),
});

const data = await res.json();
if (!data.app?.files?.length) {
  console.error("No app generated:", JSON.stringify(data).slice(0, 500));
  process.exit(1);
}

const outDir = join(process.cwd(), ".tmp-app-build");
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

for (const f of data.app.files) {
  const p = join(outDir, f.path);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, f.code, "utf-8");
}
console.log(`Wrote ${data.app.files.length} files to ${outDir}`);

try {
  console.log("--- npm install ---");
  execSync("npm install --legacy-peer-deps --no-audit --no-fund", {
    cwd: outDir,
    stdio: "inherit",
    timeout: 300_000,
  });
  console.log("--- next build ---");
  execSync("npm run build", { cwd: outDir, stdio: "inherit", timeout: 300_000 });
  console.log("BUILD OK");
} catch {
  console.error("BUILD FAILED");
  process.exit(1);
}

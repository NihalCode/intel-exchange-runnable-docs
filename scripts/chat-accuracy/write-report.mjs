#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..");
const OUTPUT_DIR = path.join(ROOT, "artifacts", "chat-accuracy");
const REPORT_PATH = path.join(OUTPUT_DIR, "demo-critical-report.json");
const MARKDOWN_PATH = path.join(OUTPUT_DIR, "DEMO_REPORT.md");

async function main() {
  const report = JSON.parse(await readFile(REPORT_PATH, "utf8"));
  const results = report.results ?? [];
  const passed = results.filter((result) => result.status === "passed").length;
  const failed = results.length - passed;
  const lines = [
    "# Demo-critical chat accuracy report",
    "",
    `Generated: ${report.generatedAt}`,
    `Cases: ${results.length}`,
    `Passed: ${passed}`,
    `Failed: ${failed}`,
    "",
    "## Cases",
    ...results.map(
      (result) =>
        `- ${result.status === "passed" ? "PASS" : "FAIL"} \`${result.id}\`: ${result.summary}`
    ),
    "",
  ];
  await mkdir(OUTPUT_DIR, { recursive: true });
  await writeFile(MARKDOWN_PATH, lines.join("\n"), "utf8");
  console.log(`Wrote ${path.relative(ROOT, MARKDOWN_PATH)}`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`chat:report failed: ${error.message}`);
  process.exitCode = 1;
});

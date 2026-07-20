#!/usr/bin/env node
/**
 * Aggregate chat-accuracy artifact reports into one markdown summary.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..");
const OUTPUT_DIR = path.join(ROOT, "artifacts", "chat-accuracy");
const MARKDOWN_PATH = path.join(OUTPUT_DIR, "DEMO_REPORT.md");
const AGGREGATE_PATH = path.join(OUTPUT_DIR, "AGGREGATE_REPORT.md");

const REPORT_FILES = [
  "demo-critical-report.json",
  "response-quality-report.json",
  "manifest-suite-report.json",
  "build-app-report.json",
  "idempotency-report.json",
  "degraded-report.json",
];

async function loadReport(name) {
  try {
    const raw = await readFile(path.join(OUTPUT_DIR, name), "utf8");
    return { name, data: JSON.parse(raw) };
  } catch {
    return null;
  }
}

function summarize(report) {
  const results = report.data.results ?? report.data.cases ?? [];
  if (!Array.isArray(results) || results.length === 0) {
    return {
      name: report.name,
      total: report.data.total ?? 0,
      passed: report.data.passed ?? 0,
      failed: report.data.failed ?? 0,
      lines: [`- (no case results in ${report.name})`],
    };
  }
  const passed = results.filter((r) => r.status === "passed" || r.status === "PASS").length;
  const failed = results.length - passed;
  return {
    name: report.name,
    total: results.length,
    passed,
    failed,
    lines: results.slice(0, 80).map(
      (result) =>
        `- ${result.status === "passed" || result.status === "PASS" ? "PASS" : "FAIL"} \`${result.id}\`: ${result.summary ?? result.message ?? ""}`
    ),
  };
}

async function main() {
  await mkdir(OUTPUT_DIR, { recursive: true });
  const loaded = [];
  for (const name of REPORT_FILES) {
    const report = await loadReport(name);
    if (report) loaded.push(report);
  }

  // Always keep DEMO_REPORT from demo-critical if present
  const demo = loaded.find((r) => r.name === "demo-critical-report.json");
  if (demo) {
    const s = summarize(demo);
    const lines = [
      "# Demo-critical chat accuracy report",
      "",
      `Generated: ${demo.data.generatedAt ?? new Date().toISOString()}`,
      `Cases: ${s.total}`,
      `Passed: ${s.passed}`,
      `Failed: ${s.failed}`,
      "",
      "## Cases",
      ...s.lines,
      "",
    ];
    await writeFile(MARKDOWN_PATH, lines.join("\n"), "utf8");
    console.log(`Wrote ${path.relative(ROOT, MARKDOWN_PATH)}`);
    if (s.failed > 0) process.exitCode = 1;
  }

  const aggregate = [
    "# Chat accuracy aggregate report",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
  ];
  let anyFail = false;
  for (const report of loaded) {
    const s = summarize(report);
    if (s.failed > 0) anyFail = true;
    aggregate.push(`## ${s.name}`, "", `Cases: ${s.total} · Passed: ${s.passed} · Failed: ${s.failed}`, "", ...s.lines, "");
  }
  if (loaded.length === 0) {
    aggregate.push("_No report JSON files found under artifacts/chat-accuracy/._", "");
  }
  await writeFile(AGGREGATE_PATH, aggregate.join("\n"), "utf8");
  console.log(`Wrote ${path.relative(ROOT, AGGREGATE_PATH)}`);
  if (anyFail) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`chat:report failed: ${error.message}`);
  process.exitCode = 1;
});

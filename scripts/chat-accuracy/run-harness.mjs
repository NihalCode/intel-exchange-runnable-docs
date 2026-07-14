#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..");
const npmCli = process.env.npm_execpath;

function run(args) {
  if (!npmCli) throw new Error("chat:accuracy must be invoked through npm.");
  const result = spawnSync(process.execPath, [npmCli, ...args], {
    cwd: ROOT,
    stdio: "inherit",
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run(["run", "chat:manifest"]);
run(["test", "--", "chat-accuracy"]);
run(["run", "chat:report"]);

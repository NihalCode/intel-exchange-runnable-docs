#!/usr/bin/env node
/**
 * Local chat + Build App canary for a single APP_PRODUCT_ID (no Open API creds).
 * Requires .env.local OpenAI (and optional Pinecone). Auth disabled.
 *
 * Usage:
 *   node --env-file=.env.local scripts/local-product-canary.mjs --product=csap
 *   node --env-file=.env.local scripts/local-product-canary.mjs --product=cftr
 */
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:net";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

function argValue(name) {
  const hit = process.argv.find((a) => a.startsWith(`${name}=`));
  return hit ? hit.slice(name.length + 1) : null;
}

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      server.close(() => resolve(port));
    });
    server.on("error", reject);
  });
}

async function waitReady(baseUrl, timeoutMs = 180_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${baseUrl}/api/health/live`);
      if (res.ok) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error(`Server not ready at ${baseUrl}`);
}

async function ask(baseUrl, query, mode, productId, developerToken) {
  const res = await fetch(`${baseUrl}/api/agent`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(developerToken
        ? {
            authorization: `Bearer ${developerToken}`,
            "x-developer-token": developerToken,
          }
        : {}),
    },
    body: JSON.stringify({ query, mode, productId }),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* ignore */
  }
  const workflow = String(json?.workflow || "");
  const steps = Array.isArray(json?.steps) ? json.steps : [];
  const app = json?.app;
  const abstention =
    Boolean(json?.unsupportedEndpointAbstention) ||
    /can.?t verify/i.test(workflow) ||
    /won.?t suggest/i.test(workflow);
  const pass =
    res.ok &&
    !abstention &&
    !json?.error &&
    (mode === "app_builder"
      ? Boolean(app?.files?.length)
      : steps.length > 0 || workflow.length > 40);
  return {
    status: res.status,
    ok: res.ok,
    pass,
    mode: json?.mode,
    retrievalMode: json?.retrievalMode,
    retrievalDegraded: json?.retrievalDegraded,
    stepCount: steps.length,
    stepTitles: steps.slice(0, 5).map((s) => s.title || s.slug).filter(Boolean),
    hasApp: Boolean(app),
    appFileCount: app?.files?.length || 0,
    abstention,
    error: json?.error || null,
    code: json?.code || null,
    preview: workflow.slice(0, 280),
  };
}

async function main() {
  const product = argValue("--product");
  if (product !== "csap" && product !== "cftr") {
    console.error("Usage: --product=csap|cftr");
    process.exit(2);
  }
  if (!process.env.OPENAI_API_KEY?.trim()) {
    console.error("OPENAI_API_KEY missing (pass --env-file=.env.local)");
    process.exit(2);
  }
  const developerToken =
    process.env.DEVELOPER_ACCESS_TOKEN?.trim() || `local-canary-${product}-${Date.now()}`;
  if (!process.env.DEVELOPER_ACCESS_TOKEN?.trim()) {
    process.env.DEVELOPER_ACCESS_TOKEN = developerToken;
  }

  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const nextBin = path.join(ROOT, "node_modules", "next", "dist", "bin", "next");
  const child = spawn(process.execPath, [nextBin, "dev", "-H", "127.0.0.1", "-p", String(port)], {
    cwd: ROOT,
    env: {
      ...process.env,
      AUTH_DISABLED: "true",
      APP_PRODUCT_ID: product,
      PORT: String(port),
      NODE_ENV: "development",
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  let logs = "";
  child.stdout.on("data", (d) => {
    logs += d.toString();
  });
  child.stderr.on("data", (d) => {
    logs += d.toString();
  });

  const cases =
    product === "csap"
      ? [
          { id: "auth", query: "How does Open API authentication work for CSAP?", mode: "workflow" },
          { id: "list", query: "How do I list alerts or threat shares in CSAP?", mode: "workflow" },
          {
            id: "build",
            query: "Build a simple Next.js app that tests CSAP connectivity",
            mode: "app_builder",
          },
        ]
      : [
          { id: "auth", query: "How does Open API authentication work for CFTR?", mode: "workflow" },
          { id: "list", query: "How do I list incidents in CFTR?", mode: "workflow" },
          {
            id: "build",
            query: "Build a simple Next.js app that tests CFTR connectivity",
            mode: "app_builder",
          },
        ];

  try {
    await waitReady(baseUrl);
    const results = [];
    for (const c of cases) {
      const outcome = await ask(baseUrl, c.query, c.mode, product, developerToken);
      results.push({ product, ...c, ...outcome });
      console.log(
        JSON.stringify(
          {
            product,
            id: c.id,
            pass: outcome.pass,
            status: outcome.status,
            retrievalMode: outcome.retrievalMode,
            stepTitles: outcome.stepTitles,
            appFileCount: outcome.appFileCount,
            preview: outcome.preview,
          },
          null,
          2
        )
      );
    }
    const failed = results.filter((r) => !r.pass).length;
    const report = {
      generatedAt: new Date().toISOString(),
      product,
      status: failed ? "FAIL" : "PASS",
      totals: { total: results.length, failed, passed: results.length - failed },
      results,
    };
    const outDir = path.join(ROOT, "artifacts", "chat-accuracy");
    mkdirSync(outDir, { recursive: true });
    const outPath = path.join(outDir, `local-${product}-canary.json`);
    writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    console.log(`\nWrote ${path.relative(ROOT, outPath)} — ${report.status}`);
    process.exit(failed ? 1 : 0);
  } catch (error) {
    console.error(error);
    console.error("\n--- server logs (tail) ---\n", logs.slice(-4000));
    process.exit(1);
  } finally {
    child.kill("SIGTERM");
    setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {
        /* ignore */
      }
    }, 2000).unref?.();
  }
}

main();

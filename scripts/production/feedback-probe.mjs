#!/usr/bin/env node
/**
 * Production smoke for Ask AI feedback (anonymous + CSRF).
 * Exit 0 when all products accept thumbs up/down; non-zero on any failure.
 *
 *   node scripts/production/feedback-probe.mjs
 *   node scripts/production/feedback-probe.mjs --base=https://apitest1.cyninjadev.com
 */

const PRODUCTS = [
  { product: "ctix", baseUrl: "https://apitest1.cyninjadev.com" },
  { product: "cftr", baseUrl: "https://cyware-docs-cftr.vercel.app" },
  { product: "csap", baseUrl: "https://cyware-docs-csap.vercel.app" },
  { product: "orchestrate", baseUrl: "https://cyware-docs-orchestrate.vercel.app" },
];

function argValue(name) {
  const hit = process.argv.find((a) => a.startsWith(`${name}=`));
  return hit ? hit.slice(name.length + 1) : null;
}

function parseSetCookie(setCookieHeader) {
  if (!setCookieHeader) return [];
  const raw = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
  return raw.map((line) => line.split(";")[0].trim()).filter(Boolean);
}

async function obtainCsrf(baseUrl) {
  const res = await fetch(`${baseUrl}/api/auth/csrf`, { redirect: "manual" });
  const body = await res.json().catch(() => ({}));
  const cookies = parseSetCookie(res.headers.getSetCookie?.() ?? res.headers.get("set-cookie"));
  const csrfToken = body.csrfToken;
  if (!csrfToken || cookies.length === 0) {
    throw new Error(`CSRF bootstrap failed (${res.status})`);
  }
  return { csrfToken, cookieHeader: cookies.join("; ") };
}

async function postFeedback(baseUrl, csrfToken, cookieHeader, rating) {
  const messageId = `probe-${rating}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const res = await fetch(`${baseUrl}/api/agent/feedback`, {
    method: "POST",
    redirect: "manual",
    headers: {
      "content-type": "application/json",
      origin: baseUrl,
      "x-csrf-token": csrfToken,
      cookie: cookieHeader,
    },
    body: JSON.stringify({
      messageId,
      rating,
      productId: "ctix",
    }),
  });
  const text = await res.text();
  let json = {};
  try {
    json = JSON.parse(text);
  } catch {
    /* ignore */
  }
  return { status: res.status, json, messageId, text };
}

async function probeProduct({ product, baseUrl }) {
  const health = await fetch(`${baseUrl}/api/health/live`);
  const healthOk = health.ok;
  let commitSha = null;
  try {
    const setup = await fetch(`${baseUrl}/api/auth/setup-status`).then((r) => r.json());
    commitSha = setup?.deployment?.commitSha ?? null;
  } catch {
    /* optional */
  }

  const { csrfToken, cookieHeader } = await obtainCsrf(baseUrl);
  const up = await postFeedback(baseUrl, csrfToken, cookieHeader, "up");
  const down = await postFeedback(baseUrl, csrfToken, cookieHeader, "down");

  const pass =
    healthOk &&
    up.status === 200 &&
    up.json?.id &&
    down.status === 200 &&
    down.json?.id;

  return {
    product,
    baseUrl,
    commitSha,
    health: healthOk ? "ok" : "fail",
    up: `${up.status}${up.json?.id ? ` id=${up.json.id.slice(0, 8)}` : ` err=${up.json?.error ?? up.text.slice(0, 80)}`}`,
    down: `${down.status}${down.json?.id ? ` id=${down.json.id.slice(0, 8)}` : ` err=${down.json?.error ?? down.text.slice(0, 80)}`}`,
    pass: pass ? "PASS" : "FAIL",
  };
}

async function main() {
  const onlyBase = argValue("--base");
  const targets = onlyBase
    ? PRODUCTS.filter((p) => p.baseUrl === onlyBase || p.product === onlyBase)
    : PRODUCTS;
  if (targets.length === 0) {
    console.error("No matching product for --base");
    process.exit(2);
  }

  const rows = [];
  for (const target of targets) {
    try {
      rows.push(await probeProduct(target));
    } catch (error) {
      rows.push({
        product: target.product,
        baseUrl: target.baseUrl,
        commitSha: null,
        health: "error",
        up: "error",
        down: "error",
        pass: "FAIL",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  console.log("\nAsk AI feedback production probe\n");
  for (const row of rows) {
    console.log(
      `${row.pass}  ${row.product.padEnd(12)}  health=${row.health}  up=${row.up}  down=${row.down}  sha=${row.commitSha ?? "?"}`
    );
    if (row.error) console.log(`       ${row.error}`);
  }
  const failed = rows.filter((r) => r.pass !== "PASS");
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

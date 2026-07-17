#!/usr/bin/env node
/**
 * Remote auth smoke test — no secrets printed.
 *
 * Usage:
 *   node scripts/auth-smoke.mjs --base-url=https://cyware-docs-ctix.vercel.app
 *   node scripts/auth-smoke.mjs --all
 */

const PRODUCTS = ["ctix", "cftr", "csap", "orchestrate"];

function parseArgs(argv) {
  const all = argv.includes("--all");
  const baseArg = argv.find((a) => a.startsWith("--base-url="));
  return {
    all,
    baseUrl: baseArg ? baseArg.slice("--base-url=".length).replace(/\/+$/, "") : null,
  };
}

async function smokeOne(baseUrl) {
  const result = {
    baseUrl,
    live: null,
    authHealth: null,
    setup: null,
    signIn: null,
    login: null,
    ok: false,
    failures: [],
  };

  try {
    const liveRes = await fetch(`${baseUrl}/api/health/live`);
    result.live = liveRes.status;
    if (liveRes.status !== 200) result.failures.push(`live=${liveRes.status}`);
  } catch (error) {
    result.failures.push(`live_error:${error instanceof Error ? error.message : "fetch"}`);
  }

  try {
    const authRes = await fetch(`${baseUrl}/api/health/auth`);
    const body = await authRes.json().catch(() => ({}));
    result.authHealth = {
      http: authRes.status,
      ready: Boolean(body.ready),
      databaseReady: Boolean(body.databaseReady),
      reasonCodes: body.reasonCodes ?? [],
      productId: body.productId ?? null,
    };
    if (!body.ready) result.failures.push(`auth_not_ready:${(body.reasonCodes || []).join(",")}`);
  } catch (error) {
    result.failures.push(`auth_health_error:${error instanceof Error ? error.message : "fetch"}`);
  }

  try {
    const setupRes = await fetch(`${baseUrl}/api/auth/setup-status`);
    const body = await setupRes.json().catch(() => ({}));
    result.setup = {
      http: setupRes.status,
      authReady: Boolean(body.authReady),
      dbConnected: Boolean(body.database?.connected),
      dbReason: body.database?.reasonCode ?? null,
      reasonCodes: body.reasonCodes ?? [],
    };
    if (!body.authReady) result.failures.push("setup_authReady=false");
  } catch (error) {
    result.failures.push(`setup_error:${error instanceof Error ? error.message : "fetch"}`);
  }

  try {
    const signInRes = await fetch(`${baseUrl}/sign-in`);
    result.signIn = signInRes.status;
    if (signInRes.status !== 200) result.failures.push(`sign-in=${signInRes.status}`);
  } catch (error) {
    result.failures.push(`sign-in_error:${error instanceof Error ? error.message : "fetch"}`);
  }

  try {
    const loginRes = await fetch(`${baseUrl}/auth/login?connection=google-oauth2&returnTo=%2F`, {
      redirect: "manual",
    });
    const text = await loginRes.text();
    const isBridge =
      loginRes.status === 200 &&
      (text.includes("auth0.com/authorize") || text.includes("/authorize"));
    const isRedirect =
      loginRes.status >= 300 &&
      loginRes.status < 400 &&
      String(loginRes.headers.get("location") || "").includes("auth0.com");
    result.login = {
      http: loginRes.status,
      bridgeOrRedirect: isBridge || isRedirect,
    };
    if (loginRes.status === 500) result.failures.push("login_HTTP_500");
    if (!isBridge && !isRedirect) {
      result.failures.push(`login_unexpected_status=${loginRes.status}`);
    }
  } catch (error) {
    result.failures.push(`login_error:${error instanceof Error ? error.message : "fetch"}`);
  }

  result.ok = result.failures.length === 0;
  return result;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const targets = args.all
    ? PRODUCTS.map((p) => `https://cyware-docs-${p}.vercel.app`)
    : args.baseUrl
      ? [args.baseUrl]
      : null;

  if (!targets) {
    console.error("Usage: node scripts/auth-smoke.mjs --base-url=https://... | --all");
    process.exit(2);
  }

  const rows = [];
  for (const baseUrl of targets) {
    const row = await smokeOne(baseUrl);
    rows.push(row);
    console.log(JSON.stringify(row, null, 2));
  }

  const failed = rows.filter((r) => !r.ok);
  console.log(
    `\nSummary: ${rows.length - failed.length}/${rows.length} passed`
  );
  process.exit(failed.length ? 1 : 0);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

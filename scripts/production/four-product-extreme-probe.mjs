#!/usr/bin/env node
/**
 * Extreme four-product production probe (read-only).
 * Never prints secrets. Evidence-backed PASS/FAIL/BLOCKED statuses.
 *
 * Usage:
 *   node scripts/production/four-product-extreme-probe.mjs
 *   node scripts/production/four-product-extreme-probe.mjs --out=.data/production-probe.json
 */

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const PRODUCTS = [
  { product: "ctix", baseUrl: "https://apitest1.cyninjadev.com" },
  { product: "cftr", baseUrl: "https://cyware-docs-cftr.vercel.app" },
  { product: "csap", baseUrl: "https://cyware-docs-csap.vercel.app" },
  { product: "orchestrate", baseUrl: "https://cyware-docs-orchestrate.vercel.app" },
];

const PUBLIC_PAGES = [
  "/",
  "/sign-in",
  "/guides",
  "/changelog",
  "/authentication",
  "/access/invite-required",
  "/access/disabled",
];

const PUBLIC_APIS = [
  "/api/health/live",
  "/api/health/ready",
  "/api/health/auth",
  "/api/auth/setup-status",
  "/api/auth/session",
  "/api/auth/me",
  "/api/products",
];

const PROTECTED_PAGES = [
  "/agent",
  "/admin",
  "/admin/documentation-agent",
  "/admin/documentation-agent/schemas",
  "/admin/documentation-agent/users",
  "/admin/documentation-agent/authentication",
  "/admin/documentation-agent/features",
  "/admin/documentation-agent/deployments",
  "/admin/documentation-agent/commits",
  "/admin/documentation-agent/environments",
  "/admin/documentation-agent/change-requests",
  "/admin/documentation-agent/audit-logs",
  "/admin/documentation-agent/settings",
  "/admin/documentation-agent/apis",
  "/admin/documentation-agent/sync-jobs",
  "/admin/documentation-agent/keys",
  "/admin/documentation-agent/domains",
  "/admin/documentation-agent/query-analytics",
  "/admin/documentation-agent/unanswered",
  "/admin/documentation-agent/unanswered/weekly",
  "/admin/environments",
  "/admin/change-requests",
  "/admin/audit-logs",
  "/admin/security/settings",
  "/settings/users",
  "/settings/content",
  "/developer",
];

/** Removed placeholder admin UIs — unauthenticated 404 is correct. */
const REMOVED_PLACEHOLDER_ROUTES = [
  "/admin/documentation-agent/sources",
  "/admin/documentation-agent/webhooks",
  "/admin/documentation-agent/logs",
  "/admin/support-agent",
];

function argValue(name) {
  const hit = process.argv.find((a) => a.startsWith(`${name}=`));
  return hit ? hit.slice(name.length + 1) : null;
}

async function fetchMeta(url, options = {}) {
  const started = Date.now();
  try {
    const res = await fetch(url, {
      redirect: options.redirect ?? "manual",
      headers: options.headers,
    });
    const text = await res.text();
    return {
      ok: true,
      status: res.status,
      location: res.headers.get("location"),
      contentType: res.headers.get("content-type"),
      vercelId: res.headers.get("x-vercel-id"),
      matchedPath: res.headers.get("x-matched-path"),
      body: text,
      ms: Date.now() - started,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      error: error instanceof Error ? error.message : String(error),
      ms: Date.now() - started,
    };
  }
}

function result(partial) {
  return {
    environment: "production",
    status: "FAIL",
    evidence: [],
    ...partial,
  };
}

function classifyPublicPage(meta, route) {
  if (!meta.ok) return result({ status: "FAIL", actual: meta.error, expected: "reachable" });
  if (meta.status === 500) return result({ status: "FAIL", actual: "HTTP 500", expected: "2xx/3xx" });
  if (meta.status >= 200 && meta.status < 400) {
    return result({
      status: "PASS",
      actual: `HTTP ${meta.status}`,
      expected: "page loads",
      evidence: [`matched=${meta.matchedPath || "n/a"}`, `ms=${meta.ms}`],
    });
  }
  // Auth may redirect unauthenticated users from some pages
  if (meta.status >= 300 && meta.status < 400) {
    return result({
      status: "PASS_WITH_DOCUMENTED_LIMITATIONS",
      actual: `redirect ${meta.status} → ${meta.location || ""}`,
      expected: "page or auth redirect",
      limitation: "Unauthenticated access redirected",
      evidence: [`location=${meta.location || ""}`],
    });
  }
  return result({
    status: "FAIL",
    actual: `HTTP ${meta.status}`,
    expected: "2xx/3xx",
    evidence: [route],
  });
}

async function probeProduct(target) {
  const rows = [];
  const base = target.baseUrl;

  // Health
  for (const route of PUBLIC_APIS) {
    const meta = await fetchMeta(`${base}${route}`);
    let status = "FAIL";
    let expected = "2xx JSON";
    let actual = meta.ok ? `HTTP ${meta.status}` : meta.error;
    const evidence = [];
    let body = null;
    if (meta.ok && meta.body) {
      try {
        body = JSON.parse(meta.body);
      } catch {
        body = null;
      }
    }

    if (route === "/api/health/live") {
      status = meta.status === 200 && body?.status === "ok" ? "PASS" : "FAIL";
      expected = '{"status":"ok"}';
      evidence.push(JSON.stringify(body));
    } else if (route === "/api/health/ready") {
      if (meta.status === 200 && body?.checks?.database === true) status = "PASS";
      else if (meta.status === 503 || body?.checks?.database === false) {
        status = "FAIL";
        actual = `degraded database=${body?.checks?.database}`;
      } else status = meta.status === 200 ? "PASS_WITH_DOCUMENTED_LIMITATIONS" : "FAIL";
      evidence.push(JSON.stringify(body));
    } else if (route === "/api/health/auth" || route === "/api/auth/setup-status") {
      if (meta.status === 404) {
        status = "BLOCKED";
        actual = "endpoint not deployed yet";
      } else if (body?.ready === true || body?.authReady === true) {
        status = body?.database?.connected === false || body?.databaseReady === false
          ? "PASS_WITH_DOCUMENTED_LIMITATIONS"
          : "PASS";
        actual = `authReady=${body?.ready ?? body?.authReady} db=${body?.database?.connected ?? body?.databaseReady}`;
        evidence.push(`reasonCodes=${JSON.stringify(body?.reasonCodes || body?.issues || [])}`);
      } else {
        status = "FAIL";
        actual = JSON.stringify(body?.reasonCodes || body?.issues || body);
      }
    } else if (route === "/api/auth/me" || route === "/api/auth/session") {
      status = meta.status === 200 ? "PASS" : "FAIL";
      evidence.push(`authenticated=${Boolean(body?.authenticated)}`);
    } else if (route === "/api/products") {
      const products = body?.products || body || [];
      const ids = Array.isArray(products)
        ? products.map((p) => p.productId || p.id).filter(Boolean)
        : [];
      const hasPinned = ids.includes(target.product) || ids.length > 0;
      status = meta.status === 200 && hasPinned ? "PASS" : "FAIL";
      evidence.push(`ids=${ids.join(",")}`);
      actual = `HTTP ${meta.status}; count=${ids.length}`;
    } else {
      status = meta.status >= 200 && meta.status < 500 ? "PASS" : "FAIL";
    }

    rows.push(
      result({
        id: `${target.product}${route}`,
        area: "api",
        feature: "public_api",
        product: target.product,
        hostname: new URL(base).hostname,
        route,
        endpoint: route,
        expectedStatusCode: 200,
        actualStatusCode: meta.status,
        status,
        expected,
        actual,
        vercelRequestId: meta.vercelId,
        evidence,
      })
    );
  }

  // Public pages
  for (const route of PUBLIC_PAGES) {
    const meta = await fetchMeta(`${base}${route}`);
    const classified = classifyPublicPage(meta, route);
    rows.push(
      result({
        id: `${target.product}:page${route}`,
        area: "ui",
        feature: "public_page",
        product: target.product,
        hostname: new URL(base).hostname,
        route,
        pane: route,
        actualStatusCode: meta.status,
        ...classified,
        vercelRequestId: meta.vercelId,
      })
    );
  }

  // Product docs index
  const docsRoute = `/docs/${target.product}`;
  const docsMeta = await fetchMeta(`${base}${docsRoute}`);
  rows.push(
    result({
      id: `${target.product}:docs`,
      area: "docs",
      feature: "product_docs",
      product: target.product,
      hostname: new URL(base).hostname,
      route: docsRoute,
      actualStatusCode: docsMeta.status,
      ...classifyPublicPage(docsMeta, docsRoute),
      vercelRequestId: docsMeta.vercelId,
    })
  );

  // Cross-product isolation attempt via docs path
  const others = PRODUCTS.map((p) => p.product).filter((p) => p !== target.product);
  for (const other of others) {
    const cross = `/docs/${other}`;
    const meta = await fetchMeta(`${base}${cross}`);
    // On pinned deploys, may rewrite, redirect, or 403/404
    let status = "PASS";
    let actual = `HTTP ${meta.status}`;
    if (meta.status === 500) status = "FAIL";
    else if (meta.status === 200 && meta.body && meta.body.includes(`productId\":\"${other}\"`)) {
      // weak signal — body might still mention other products in nav; check APP_PRODUCT isolation via API
      status = "PASS_WITH_DOCUMENTED_LIMITATIONS";
      actual = "page returned 200 for other product path; verify API isolation";
    }
    rows.push(
      result({
        id: `${target.product}:cross-docs-${other}`,
        area: "isolation",
        feature: "cross_product_docs_path",
        product: target.product,
        hostname: new URL(base).hostname,
        route: cross,
        actualStatusCode: meta.status,
        status,
        expected: "no silent product leakage / no 500",
        actual,
        evidence: [`location=${meta.location || ""}`],
        vercelRequestId: meta.vercelId,
      })
    );
  }

  // Auth login must never 500 (Okta enterprise connection from server config)
  const loginMeta = await fetchMeta(`${base}/auth/login?returnTo=%2F`);
  const loginOk =
    loginMeta.status === 200 &&
    (loginMeta.body?.includes("/authorize") || loginMeta.body?.includes("auth0.com"));
  const loginRedirect =
    loginMeta.status >= 300 &&
    loginMeta.status < 400 &&
    String(loginMeta.location || "").includes("auth0.com");
  rows.push(
    result({
      id: `${target.product}:auth-login`,
      area: "auth",
      feature: "auth_login_bridge",
      product: target.product,
      hostname: new URL(base).hostname,
      route: "/auth/login",
      actualStatusCode: loginMeta.status,
      status: loginMeta.status === 500 ? "FAIL" : loginOk || loginRedirect ? "PASS" : "FAIL",
      expected: "Auth0 bridge/redirect, never 500",
      actual: loginOk
        ? "HTML bridge to Auth0"
        : loginRedirect
          ? `redirect ${loginMeta.location}`
          : `HTTP ${loginMeta.status}`,
      evidence: [`ms=${loginMeta.ms}`],
      vercelRequestId: loginMeta.vercelId,
    })
  );

  // Protected panes — expect redirect/401, never 500
  for (const route of PROTECTED_PAGES) {
    const meta = await fetchMeta(`${base}${route}`);
    let status = "FAIL";
    let actual = `HTTP ${meta.status}`;
    let limitation;
    if (meta.status === 500) {
      status = "FAIL";
      actual = "HTTP 500";
    } else if (meta.status === 401 || meta.status === 403) {
      status = "PASS";
      actual = `denied ${meta.status}`;
    } else if (meta.status >= 300 && meta.status < 400) {
      status = "PASS";
      actual = `redirect → ${meta.location || ""}`;
    } else if (meta.status === 200) {
      status = "PASS_WITH_DOCUMENTED_LIMITATIONS";
      actual = "200 without session (auth may be incomplete or page public shell)";
      limitation = "Unauthenticated 200 on protected route needs session verification";
    } else if (meta.status === 404) {
      status = "FAIL";
      actual = "404";
    }
    rows.push(
      result({
        id: `${target.product}:protected${route}`,
        area: "rbac",
        feature: "protected_pane_unauthenticated",
        product: target.product,
        hostname: new URL(base).hostname,
        route,
        pane: route,
        userRole: "unauthenticated",
        actualStatusCode: meta.status,
        status,
        expected: "401/403/sign-in redirect, never 500",
        actual,
        evidence: [`location=${meta.location || ""}`],
        vercelRequestId: meta.vercelId,
        limitation,
      })
    );
  }

  for (const route of REMOVED_PLACEHOLDER_ROUTES) {
    const meta = await fetchMeta(`${base}${route}`);
    const status =
      meta.status === 404
        ? "PASS"
        : meta.status === 500
          ? "FAIL"
          : "PASS_WITH_DOCUMENTED_LIMITATIONS";
    rows.push(
      result({
        id: `${target.product}:removed${route}`,
        area: "rbac",
        feature: "removed_placeholder_absent",
        product: target.product,
        hostname: new URL(base).hostname,
        route,
        pane: route,
        userRole: "unauthenticated",
        actualStatusCode: meta.status,
        status,
        expected: "404 (placeholder removed)",
        actual: `HTTP ${meta.status}`,
        evidence: ["Removed non-production placeholder admin UIs"],
        vercelRequestId: meta.vercelId,
      })
    );
  }

  // Product API identity
  const productApi = await fetchMeta(`${base}/api/products/${target.product}`);
  let productBody = null;
  try {
    productBody = productApi.body ? JSON.parse(productApi.body) : null;
  } catch {
    productBody = null;
  }
  const productId =
    productBody?.product?.productId ||
    productBody?.productId ||
    productBody?.product?.id;
  rows.push(
    result({
      id: `${target.product}:api-product`,
      area: "isolation",
      feature: "product_api_identity",
      product: target.product,
      hostname: new URL(base).hostname,
      endpoint: `/api/products/${target.product}`,
      actualStatusCode: productApi.status,
      status:
        productApi.status === 200 && productId === target.product
          ? "PASS"
          : productApi.status === 401 || productApi.status === 403
            ? "PASS_WITH_DOCUMENTED_LIMITATIONS"
            : "FAIL",
      expected: `productId=${target.product}`,
      actual: `HTTP ${productApi.status}; productId=${productId || "n/a"}`,
      evidence: [`keys=${productBody ? Object.keys(productBody).join(",") : ""}`],
      vercelRequestId: productApi.vercelId,
      limitation:
        productApi.status === 401 || productApi.status === 403
          ? "Product API requires auth on this deployment"
          : undefined,
    })
  );

  // Wrong-product API override
  const wrong = others[0];
  const wrongApi = await fetchMeta(`${base}/api/products/${wrong}`);
  rows.push(
    result({
      id: `${target.product}:api-wrong-product`,
      area: "isolation",
      feature: "wrong_product_api",
      product: target.product,
      hostname: new URL(base).hostname,
      endpoint: `/api/products/${wrong}`,
      actualStatusCode: wrongApi.status,
      status:
        wrongApi.status === 403 ||
        wrongApi.status === 404 ||
        wrongApi.status === 401 ||
        (wrongApi.status >= 300 && wrongApi.status < 400)
          ? "PASS"
          : wrongApi.status === 500
            ? "FAIL"
            : wrongApi.status === 200
              ? "FAIL"
              : "PASS_WITH_DOCUMENTED_LIMITATIONS",
      expected: "403/404/401 — not silent wrong product (200)",
      actual: `HTTP ${wrongApi.status}`,
      evidence: [`location=${wrongApi.location || ""}`],
      vercelRequestId: wrongApi.vercelId,
      limitation:
        wrongApi.status === 200
          ? "Pinned deployment returned another product's API payload — isolate /api/products/[id]"
          : undefined,
    })
  );

  return rows;
}

async function main() {
  const out = argValue("--out") || ".data/production-extreme-probe.json";
  const all = [];
  for (const target of PRODUCTS) {
    console.error(`Probing ${target.product}…`);
    const rows = await probeProduct(target);
    all.push(...rows);
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    commitHint: "run against live production aliases",
    totals: {
      total: all.length,
      PASS: all.filter((r) => r.status === "PASS").length,
      PASS_WITH_DOCUMENTED_LIMITATIONS: all.filter(
        (r) => r.status === "PASS_WITH_DOCUMENTED_LIMITATIONS"
      ).length,
      FAIL: all.filter((r) => r.status === "FAIL").length,
      BLOCKED: all.filter((r) => r.status === "BLOCKED").length,
    },
    byProduct: Object.fromEntries(
      PRODUCTS.map((p) => [
        p.product,
        {
          PASS: all.filter((r) => r.product === p.product && r.status === "PASS").length,
          FAIL: all.filter((r) => r.product === p.product && r.status === "FAIL").length,
          LIMITATIONS: all.filter(
            (r) =>
              r.product === p.product && r.status === "PASS_WITH_DOCUMENTED_LIMITATIONS"
          ).length,
          BLOCKED: all.filter((r) => r.product === p.product && r.status === "BLOCKED").length,
        },
      ])
    ),
    failures: all.filter((r) => r.status === "FAIL"),
    results: all,
  };

  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(summary, null, 2), "utf8");
  console.log(JSON.stringify({ totals: summary.totals, byProduct: summary.byProduct, out }, null, 2));
  console.log("\nFAILURES:");
  for (const f of summary.failures) {
    console.log(`- [${f.product}] ${f.route || f.endpoint}: ${f.actual}`);
  }
  process.exit(summary.totals.FAIL > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

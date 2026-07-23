#!/usr/bin/env node
/**
 * Copy shared Auth0/database env vars from a source Vercel project to all four
 * product deployments, and set per-product APP_PRODUCT_ID + APP_BASE_URL.
 *
 * Usage:
 *   VERCEL_TOKEN=... node scripts/vercel/sync-product-env.mjs
 *   VERCEL_TOKEN=... VERCEL_TEAM_ID=team_xxx node scripts/vercel/sync-product-env.mjs
 *
 * Optional:
 *   SOURCE_PROJECT=intel-exchange-runnable-docs
 *   DRY_RUN=1
 */

const PRODUCTS = [
  {
    productId: "ctix",
    project: "cyware-docs-ctix",
    appBaseUrl: "https://apitest1.cyninjadev.com",
  },
  {
    productId: "csap",
    project: "cyware-docs-csap",
    appBaseUrl: "https://cyware-docs-csap.vercel.app",
  },
  {
    productId: "cftr",
    project: "cyware-docs-cftr",
    appBaseUrl: "https://cyware-docs-cftr.vercel.app",
  },
  {
    productId: "orchestrate",
    project: "cyware-docs-orchestrate",
    appBaseUrl: "https://cyware-docs-orchestrate.vercel.app",
  },
];

const SHARED_ENV_KEYS = [
  "AUTH0_SECRET",
  "AUTH0_ISSUER_BASE_URL",
  "AUTH0_DOMAIN",
  "AUTH0_CLIENT_ID",
  "AUTH0_CLIENT_SECRET",
  "AUTH0_ACTION_SHARED_SECRET",
  "AUTH0_MANAGEMENT_CLIENT_ID",
  "AUTH0_MANAGEMENT_CLIENT_SECRET",
  "AUTH0_MANAGEMENT_AUDIENCE",
  "AUTH0_DATABASE_CONNECTION",
  "AUTH0_GOOGLE_CONNECTION",
  "AUTH0_EMAIL_CONNECTION",
  "AUTH0_OKTA_CONNECTION",
  "INVITE_SKIP_IDP_PROVISION",
  "AUTH_COOKIE_DOMAIN",
  "CROSS_DOMAIN_SSO_ENABLED",
  "DATABASE_URL",
  "INITIAL_OWNER_EMAIL",
  "DOCUMENTATION_BOOTSTRAP_OWNER_EMAIL",
  "INITIAL_ADMIN_EMAIL",
  "OPENAI_API_KEY",
  "PINECONE_API_KEY",
  "PINECONE_INDEX",
  "PINECONE_CLOUD",
  "PINECONE_REGION",
  "VERCEL_TOKEN",
  "VERCEL_TEAM_ID",
  "RESEND_API_KEY",
  "INVITE_EMAIL_FROM",
];

/** Keys that must be non-empty when present on the source project. */
const REQUIRED_RETRIEVAL_KEYS = ["OPENAI_API_KEY", "PINECONE_API_KEY", "PINECONE_INDEX"];

const SENSITIVE_KEYS = new Set([
  "AUTH0_SECRET",
  "AUTH0_CLIENT_SECRET",
  "AUTH0_ACTION_SHARED_SECRET",
  "AUTH0_MANAGEMENT_CLIENT_SECRET",
  "DATABASE_URL",
  "OPENAI_API_KEY",
  "PINECONE_API_KEY",
  "VERCEL_TOKEN",
  "RESEND_API_KEY",
]);

function teamQuery(teamId) {
  return teamId ? `?teamId=${encodeURIComponent(teamId)}` : "";
}

async function vercelFetch(path, token, init = {}) {
  const res = await fetch(`https://api.vercel.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = data.error?.message ?? data.message ?? res.statusText;
    throw new Error(`${path}: ${message}`);
  }
  return data;
}

async function listProjectEnv(projectName, token, teamId) {
  const data = await vercelFetch(
    `/v9/projects/${encodeURIComponent(projectName)}/env${teamQuery(teamId)}`,
    token
  );
  return Array.isArray(data.envs) ? data.envs : [];
}

async function upsertProjectEnv(projectName, token, teamId, entries) {
  if (entries.length === 0) return;
  const qs = teamId
    ? `?upsert=true&teamId=${encodeURIComponent(teamId)}`
    : "?upsert=true";
  await vercelFetch(
    `/v10/projects/${encodeURIComponent(projectName)}/env${qs}`,
    token,
    {
      method: "POST",
      body: JSON.stringify(entries),
    }
  );
}

function latestEnvValue(envs, key) {
  const matches = envs.filter((row) => row.key === key);
  if (matches.length === 0) return null;
  const sorted = matches.sort((a, b) => Number(b.updatedAt ?? 0) - Number(a.updatedAt ?? 0));
  return sorted[0]?.value ?? null;
}

function buildEntry(key, value) {
  return {
    key,
    value,
    type: SENSITIVE_KEYS.has(key) ? "encrypted" : "plain",
    target: ["production", "preview", "development"],
  };
}

async function main() {
  const token = process.env.VERCEL_TOKEN?.trim();
  if (!token) {
    console.error("Set VERCEL_TOKEN to a Vercel account token with project env access.");
    process.exit(1);
  }

  const teamId = process.env.VERCEL_TEAM_ID?.trim() || undefined;
  const sourceProject =
    process.env.SOURCE_PROJECT?.trim() || "intel-exchange-runnable-docs";
  const dryRun = process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true";

  console.log(`Reading shared env from source project: ${sourceProject}`);
  const sourceEnv = await listProjectEnv(sourceProject, token, teamId);

  const sharedValues = {};
  const missing = [];
  for (const key of SHARED_ENV_KEYS) {
    const value = latestEnvValue(sourceEnv, key);
    if (value) sharedValues[key] = value;
    else if (["AUTH0_SECRET", "AUTH0_CLIENT_ID", "AUTH0_CLIENT_SECRET", "AUTH0_ISSUER_BASE_URL", "DATABASE_URL"].includes(key)) {
      missing.push(key);
    }
  }

  if (missing.length > 0) {
    console.warn(
      `Warning: source project is missing critical keys: ${missing.join(", ")}`
    );
  }

  const missingRetrieval = REQUIRED_RETRIEVAL_KEYS.filter((key) => !sharedValues[key]);
  if (missingRetrieval.length > 0) {
    console.warn(
      `Warning: retrieval keys missing on source (Ask AI will degrade to local index): ${missingRetrieval.join(", ")}`
    );
  }

  for (const product of PRODUCTS) {
    const entries = [];
    for (const [key, value] of Object.entries(sharedValues)) {
      entries.push(buildEntry(key, value));
    }
    entries.push(buildEntry("APP_PRODUCT_ID", product.productId));
    entries.push(buildEntry("APP_BASE_URL", product.appBaseUrl));
    entries.push(buildEntry("VECTOR_NAMESPACE", `product-${product.productId}`));
    entries.push(buildEntry("MULTI_PROJECT_DEPLOYMENT", "true"));

    console.log(`\n${product.project} (${product.productId})`);
    console.log(`  APP_BASE_URL=${product.appBaseUrl}`);
    console.log(`  syncing ${entries.length} env vars`);

    if (dryRun) continue;
    await upsertProjectEnv(product.project, token, teamId, entries);
    console.log("  upserted");
  }

  console.log(
    dryRun
      ? "\nDRY_RUN=1 — no changes written. Re-run without DRY_RUN to apply."
      : "\nDone. Redeploy all four product projects in Vercel."
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

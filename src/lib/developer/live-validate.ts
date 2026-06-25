import crypto from "node:crypto";
import dns from "node:dns/promises";
import net from "node:net";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { buildEndpointSnippets, buildRunnableRequest } from "../snippets";
import { applyPathParams, resolveStructured, unresolvedPathParams } from "../resolve-request";
import { isMutating } from "../security";
import type { EndpointPage } from "../types";
import { envKeyFor, readDeveloperCredentialStatus } from "./credential-env";
import { isDeveloperAccessConfigured } from "./access";

const TIMEOUT_MS = 15_000;
const MAX_BODY = 4_000;

function fileNameForSlug(slug: string): string {
  return slug.replace(/^\/+|\/+$/g, "").replace(/\//g, "__") + ".json";
}

export interface EndpointValidationResult {
  slug: string;
  title: string;
  method: string;
  path: string;
  phase: "static" | "live";
  status: "pass" | "fail" | "skip";
  message?: string;
  httpStatus?: number;
  durationMs?: number;
}

export interface ProductValidationReport {
  productId: string;
  endpointCount: number;
  static: { pass: number; fail: number; skip: number };
  live: { pass: number; fail: number; skip: number };
  results: EndpointValidationResult[];
}

export function canRunLiveValidation(productId?: string): { allowed: boolean; blockers: string[] } {
  const blockers: string[] = [];
  if (!isDeveloperAccessConfigured()) {
    blockers.push("DEVELOPER_ACCESS_TOKEN is not configured.");
  }
  if (process.env.ENABLE_API_EXECUTION !== "true") {
    blockers.push("ENABLE_API_EXECUTION is not true — live probes are disabled.");
  }
  if (productId) {
    const creds = readDeveloperCredentialStatus(productId);
    if (!creds.complete) {
      blockers.push(`Missing DEV_CYWARE_${productId.toUpperCase()}_* credentials.`);
    }
  }
  return { allowed: blockers.length === 0, blockers };
}

function pagesDirForProduct(productId: string): string {
  const root = path.join(process.cwd(), "src", "content");
  if (productId === "ctix") return path.join(root, "pages");
  return path.join(root, "products", productId, "pages");
}

async function loadManifestPath(productId: string): Promise<string> {
  if (productId === "ctix") return path.join(process.cwd(), "src", "content", "manifest.json");
  return path.join(process.cwd(), "src", "content", "products", productId, "manifest.json");
}

async function loadEndpoints(productId: string): Promise<EndpointPage[]> {
  const manifestPath = await loadManifestPath(productId);
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
    pages: { slug: string; kind: string }[];
  };
  const pagesDir = pagesDirForProduct(productId);
  const out: EndpointPage[] = [];
  for (const meta of manifest.pages) {
    if (meta.kind !== "endpoint") continue;
    try {
      const raw = await readFile(path.join(pagesDir, fileNameForSlug(meta.slug)), "utf8");
      out.push(JSON.parse(raw) as EndpointPage);
    } catch {
      /* skip missing files */
    }
  }
  return out;
}

function staticValidate(productId: string, page: EndpointPage): EndpointValidationResult {
  const base: EndpointValidationResult = {
    slug: page.slug,
    title: page.title,
    method: page.method,
    path: page.path,
    phase: "static",
    status: "pass",
  };
  try {
    if (!page.method || !page.path?.trim()) {
      return { ...base, status: "fail", message: "Missing method or path." };
    }
    const req = buildRunnableRequest(page, productId);
    if (!req.path || req.path === "/") {
      return { ...base, status: "fail", message: "Normalized path is empty." };
    }
    const snippets = buildEndpointSnippets(page, productId);
    if (snippets.length === 0) {
      return { ...base, status: "fail", message: "No snippets generated." };
    }
    if (/\{\{[^}]+\}\}/.test(req.path)) {
      return { ...base, status: "fail", message: `Unresolved path template: ${req.path}` };
    }
    return base;
  } catch (e) {
    return {
      ...base,
      status: "fail",
      message: e instanceof Error ? e.message : String(e),
    };
  }
}

function generateOpenApiAuth(accessId: string, secretKey: string) {
  const expires = Math.floor(Date.now() / 1000) + 20;
  const signature = crypto
    .createHmac("sha1", secretKey)
    .update(`${accessId}\n${expires}`)
    .digest("base64");
  return {
    AccessID: accessId,
    Signature: signature,
    Expires: String(expires),
  };
}

function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    return false;
  }
  const lower = ip.toLowerCase();
  if (lower === "::1" || lower === "::") return true;
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true;
  if (lower.startsWith("fe80")) return true;
  if (lower.startsWith("::ffff:")) return isPrivateIp(lower.slice(7));
  return false;
}

async function assertPublicHost(hostname: string): Promise<void> {
  const lower = hostname.toLowerCase();
  if (
    lower === "localhost" ||
    lower.endsWith(".localhost") ||
    lower.endsWith(".internal") ||
    lower.endsWith(".local")
  ) {
    throw new Error("Requests to local/internal hosts are blocked.");
  }
  if (net.isIP(hostname)) {
    if (isPrivateIp(hostname)) throw new Error("Requests to private IPs are blocked.");
    return;
  }
  const records = await dns.lookup(hostname, { all: true });
  for (const r of records) {
    if (isPrivateIp(r.address)) throw new Error("Host resolves to a private IP.");
  }
}

async function probeGet(url: string): Promise<{ status: number; durationMs: number; body: string }> {
  const target = new URL(url);
  await assertPublicHost(target.hostname);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const started = Date.now();
  try {
    const res = await fetch(url, { method: "GET", redirect: "follow", signal: controller.signal });
    const body = (await res.text()).slice(0, MAX_BODY);
    return { status: res.status, durationMs: Date.now() - started, body };
  } finally {
    clearTimeout(timer);
  }
}

function liveSkipReason(page: EndpointPage, productId: string): string | null {
  if (page.method !== "GET") return "Only GET endpoints are probed (mutating methods skipped).";
  if (isMutating(page.method)) return "Mutating method skipped.";
  const req = buildRunnableRequest(page, productId);
  const resolvedPath = applyPathParams(req.path, req.pathParams);
  const missing = unresolvedPathParams(resolvedPath);
  if (missing.length) return `Unresolved path params: ${missing.join(", ")}`;
  if (resolvedPath.includes("{")) return "Unresolved path placeholder.";
  return null;
}

async function liveValidate(
  productId: string,
  page: EndpointPage
): Promise<EndpointValidationResult> {
  const base: EndpointValidationResult = {
    slug: page.slug,
    title: page.title,
    method: page.method,
    path: page.path,
    phase: "live",
    status: "skip",
  };

  const skip = liveSkipReason(page, productId);
  if (skip) return { ...base, message: skip };

  const baseUrl = process.env[envKeyFor(productId, "BASE_URL")]!.trim().replace(/\/+$/, "");
  const accessId = process.env[envKeyFor(productId, "ACCESS_ID")]!.trim();
  const secretKey = process.env[envKeyFor(productId, "SECRET_KEY")]!.trim();
  const auth = generateOpenApiAuth(accessId, secretKey);

  const req = buildRunnableRequest(page, productId);
  const exec = resolveStructured(req, baseUrl, (name) => {
    if (name in auth) return auth[name as keyof typeof auth];
    return "";
  });

  try {
    const { status, durationMs, body } = await probeGet(exec.url);
    const ok =
      (status >= 200 && status < 300) ||
      status === 401 ||
      status === 403 ||
      status === 404;
    return {
      ...base,
      status: ok ? "pass" : "fail",
      httpStatus: status,
      durationMs,
      message: ok
        ? status === 403 || status === 401
          ? "Reachable (auth required or forbidden — expected without full params)."
          : status === 404
            ? "Reachable (404 — path may need tenant-specific ID)."
            : "OK"
        : `Unexpected HTTP ${status}: ${body.slice(0, 120).replace(/\s+/g, " ")}`,
    };
  } catch (e) {
    return {
      ...base,
      status: "fail",
      message: e instanceof Error ? e.message : String(e),
    };
  }
}

function summarize(results: EndpointValidationResult[]) {
  const staticResults = results.filter((r) => r.phase === "static");
  const liveResults = results.filter((r) => r.phase === "live");
  const count = (items: EndpointValidationResult[], status: EndpointValidationResult["status"]) =>
    items.filter((r) => r.status === status).length;
  return {
    static: {
      pass: count(staticResults, "pass"),
      fail: count(staticResults, "fail"),
      skip: count(staticResults, "skip"),
    },
    live: {
      pass: count(liveResults, "pass"),
      fail: count(liveResults, "fail"),
      skip: count(liveResults, "skip"),
    },
  };
}

export interface ValidateOptions {
  live?: boolean;
  /** Max live GET probes per product (default 15). Static always runs for all endpoints. */
  liveLimit?: number;
  slugs?: string[];
}

export async function validateProductEndpoints(
  productId: string,
  options: ValidateOptions = {}
): Promise<ProductValidationReport> {
  const endpoints = await loadEndpoints(productId);
  const filtered = options.slugs?.length
    ? endpoints.filter((e) => options.slugs!.includes(e.slug))
    : endpoints;

  const results: EndpointValidationResult[] = [];
  for (const page of filtered) {
    results.push(staticValidate(productId, page));
  }

  if (options.live) {
    if (!readDeveloperCredentialStatus(productId).complete) {
      results.push({
        slug: "(product)",
        title: productId,
        method: "",
        path: "",
        phase: "live",
        status: "skip",
        message: `Live probes skipped — missing DEV_CYWARE_${productId.toUpperCase()}_* credentials.`,
      });
    } else {
      const liveCandidates = filtered.filter((p) => !liveSkipReason(p, productId));
      const limit = options.liveLimit ?? 15;
      const toProbe = liveCandidates.slice(0, limit);
      for (const page of toProbe) {
        results.push(await liveValidate(productId, page));
      }
      for (const page of filtered) {
        if (toProbe.some((p) => p.slug === page.slug)) continue;
        const skip = liveSkipReason(page, productId);
        if (skip) {
          results.push({
            slug: page.slug,
            title: page.title,
            method: page.method,
            path: page.path,
            phase: "live",
            status: "skip",
            message: skip,
          });
        }
      }
    }
  }

  return {
    productId,
    endpointCount: filtered.length,
    ...summarize(results),
    results,
  };
}

export async function validateAllProducts(
  options: ValidateOptions = {}
): Promise<ProductValidationReport[]> {
  const ids = ["ctix", "csap", "orchestrate", "cftr"];
  const reports: ProductValidationReport[] = [];
  for (const productId of ids) {
    try {
      reports.push(await validateProductEndpoints(productId, options));
    } catch (e) {
      reports.push({
        productId,
        endpointCount: 0,
        static: { pass: 0, fail: 0, skip: 0 },
        live: { pass: 0, fail: 0, skip: 0 },
        results: [
          {
            slug: "(manifest)",
            title: productId,
            method: "",
            path: "",
            phase: "static",
            status: "fail",
            message: e instanceof Error ? e.message : String(e),
          },
        ],
      });
    }
  }
  return reports;
}

import type { DocumentationProduct } from "@/lib/documentation-credentials/types";

/**
 * Connectivity probe paths relative to each product's Open API root.
 * Absolute-from-host forms are used when the configured base has no product prefix
 * (e.g. docs hosts like csapapi.cyware.com / orchestrateapi.cyware.com).
 */
const CONNECTIVITY_SUFFIX: Record<DocumentationProduct, string> = {
  ctix: "/ping/",
  cftr: "/openapi/test-connectivity/",
  csap: "/v1/test_connectivity/",
  orchestrate: "/v1/test_connectivity/",
};

function normalizePathname(pathname: string): string {
  const trimmed = pathname.replace(/\/+$/, "");
  return trimmed === "" ? "" : trimmed;
}

function joinPath(root: string, suffix: string): string {
  const left = root.replace(/\/+$/, "");
  const right = suffix.startsWith("/") ? suffix : `/${suffix}`;
  return `${left}${right}`.replace(/\/{2,}/g, "/") || "/";
}

function withPath(baseUrl: string, pathname: string): URL {
  const base = new URL(baseUrl.trim());
  const path = pathname.startsWith("/") ? pathname : `/${pathname}`;
  base.pathname = path.endsWith("/") ? path : `${path}/`;
  base.search = "";
  base.hash = "";
  return base;
}

function productRoot(pathname: string, marker: string): string | null {
  const root = normalizePathname(pathname);
  const idx = root.toLowerCase().lastIndexOf(marker.toLowerCase());
  if (idx < 0) return null;
  return root.slice(0, idx + marker.length);
}

/**
 * Build the absolute connectivity-check URL for a product + tenant base URL.
 * Handles common tenant shapes (…/ctixapi, …/cftrapi, …/csap, …/soarapi[/openapi], …/co)
 * and docs hosts without a product path prefix.
 */
export function buildConnectivityUrl(
  productId: DocumentationProduct,
  baseUrl: string
): URL {
  return listConnectivityProbeUrls(productId, baseUrl)[0]!;
}

/**
 * Ordered probe URLs for credential validation. First 2xx wins.
 * Covers alternate tenant path shapes so a single wrong guess cannot
 * reject valid Access ID / Secret Key pairs.
 */
export function listConnectivityProbeUrls(
  productId: DocumentationProduct,
  baseUrl: string
): URL[] {
  const base = new URL(baseUrl.trim());
  const root = normalizePathname(base.pathname);
  const origin = base.origin;
  const seen = new Set<string>();
  const out: URL[] = [];

  const add = (pathname: string) => {
    const url = withPath(origin, pathname);
    const key = url.href;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(url);
  };

  switch (productId) {
    case "ctix": {
      const ctixRoot = productRoot(root, "/ctixapi") ?? (root || "/ctixapi");
      add(joinPath(ctixRoot, CONNECTIVITY_SUFFIX.ctix));
      break;
    }
    case "cftr": {
      const cftrRoot = productRoot(root, "/cftrapi");
      if (cftrRoot) {
        add(joinPath(cftrRoot, CONNECTIVITY_SUFFIX.cftr));
      } else if (!root) {
        // Docs host or bare origin — still list the Postman path (may 404 on docs host).
        add("/cftrapi/openapi/test-connectivity/");
        add("/openapi/test-connectivity/");
      } else {
        add(joinPath(root, CONNECTIVITY_SUFFIX.cftr));
        add("/cftrapi/openapi/test-connectivity/");
      }
      break;
    }
    case "csap": {
      const csapRoot = productRoot(root, "/csap");
      if (csapRoot) {
        // Tenant base …/csap → …/csap/v1/test_connectivity/ (do not insert another /csap).
        add(joinPath(csapRoot, CONNECTIVITY_SUFFIX.csap));
      } else if (!root) {
        add(`/csap${CONNECTIVITY_SUFFIX.csap}`);
        add(CONNECTIVITY_SUFFIX.csap);
      } else if (/(^|\/)csap(\/|$)/i.test(root)) {
        add(joinPath(root, CONNECTIVITY_SUFFIX.csap));
      } else {
        add(joinPath(root, `/csap${CONNECTIVITY_SUFFIX.csap}`));
        add(joinPath(root, CONNECTIVITY_SUFFIX.csap));
      }
      break;
    }
    case "orchestrate": {
      if (root.endsWith("/soarapi/openapi") || root.endsWith("/co/openapi")) {
        add(joinPath(root, CONNECTIVITY_SUFFIX.orchestrate));
      } else if (root.endsWith("/soarapi")) {
        add(joinPath(root, `/openapi${CONNECTIVITY_SUFFIX.orchestrate}`));
        add(joinPath(root, CONNECTIVITY_SUFFIX.orchestrate));
      } else if (root.endsWith("/co")) {
        add(joinPath(root, CONNECTIVITY_SUFFIX.orchestrate));
        add(joinPath(root, `/openapi${CONNECTIVITY_SUFFIX.orchestrate}`));
      } else if (!root) {
        add(CONNECTIVITY_SUFFIX.orchestrate);
        add(`/openapi${CONNECTIVITY_SUFFIX.orchestrate}`);
        add(`/soarapi/openapi${CONNECTIVITY_SUFFIX.orchestrate}`);
      } else {
        const soarOpen = productRoot(root, "/soarapi/openapi");
        const soar = productRoot(root, "/soarapi");
        const co = productRoot(root, "/co");
        if (soarOpen) add(joinPath(soarOpen, CONNECTIVITY_SUFFIX.orchestrate));
        if (soar) {
          add(joinPath(soar, `/openapi${CONNECTIVITY_SUFFIX.orchestrate}`));
          add(joinPath(soar, CONNECTIVITY_SUFFIX.orchestrate));
        }
        if (co) add(joinPath(co, CONNECTIVITY_SUFFIX.orchestrate));
        add(joinPath(root, CONNECTIVITY_SUFFIX.orchestrate));
      }
      break;
    }
    default: {
      add(CONNECTIVITY_SUFFIX[productId] ?? "/");
    }
  }

  return out;
}

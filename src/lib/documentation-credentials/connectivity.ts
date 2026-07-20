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

/**
 * Build the absolute connectivity-check URL for a product + tenant base URL.
 * Handles common tenant shapes (…/ctixapi, …/cftrapi, …/csap, …/soarapi[/openapi], …/co)
 * and docs hosts without a product path prefix.
 */
export function buildConnectivityUrl(
  productId: DocumentationProduct,
  baseUrl: string
): URL {
  const base = new URL(baseUrl.trim());
  const root = normalizePathname(base.pathname);
  let pathname: string;

  switch (productId) {
    case "ctix": {
      // Prefer …/ctixapi even if the user pasted …/ctixapi/v3 or similar.
      const ctixIdx = root.toLowerCase().lastIndexOf("/ctixapi");
      const ctixRoot =
        ctixIdx >= 0
          ? root.slice(0, ctixIdx + "/ctixapi".length)
          : root || "/ctixapi";
      pathname = joinPath(ctixRoot, CONNECTIVITY_SUFFIX.ctix);
      break;
    }
    case "cftr": {
      if (root.endsWith("/cftrapi")) {
        pathname = joinPath(root, CONNECTIVITY_SUFFIX.cftr);
      } else {
        pathname = "/cftrapi/openapi/test-connectivity/";
      }
      break;
    }
    case "csap": {
      // Docs path is csap/v1/test_connectivity/. Avoid doubling /csap when the
      // tenant base already ends with /csap.
      if (root.endsWith("/csap") || /(^|\/)csap$/i.test(root)) {
        pathname = joinPath(root, CONNECTIVITY_SUFFIX.csap);
      } else if (!root) {
        pathname = `/csap${CONNECTIVITY_SUFFIX.csap}`;
      } else if (/(^|\/)csap(\/|$)/i.test(root)) {
        pathname = joinPath(root, CONNECTIVITY_SUFFIX.csap);
      } else {
        pathname = joinPath(root, `/csap${CONNECTIVITY_SUFFIX.csap}`);
      }
      break;
    }
    case "orchestrate": {
      // Tenants commonly use …/soarapi/openapi or …/soarapi; older installs use …/co.
      if (root.endsWith("/soarapi")) {
        pathname = joinPath(root, `/openapi${CONNECTIVITY_SUFFIX.orchestrate}`);
      } else if (
        root.endsWith("/soarapi/openapi") ||
        root.endsWith("/co/openapi") ||
        root.endsWith("/co")
      ) {
        pathname = joinPath(root, CONNECTIVITY_SUFFIX.orchestrate);
      } else if (!root) {
        pathname = CONNECTIVITY_SUFFIX.orchestrate;
      } else {
        pathname = joinPath(root, CONNECTIVITY_SUFFIX.orchestrate);
      }
      break;
    }
    default: {
      pathname = CONNECTIVITY_SUFFIX[productId] ?? "/";
    }
  }

  base.pathname = pathname.endsWith("/") ? pathname : `${pathname}/`;
  base.search = "";
  base.hash = "";
  return base;
}

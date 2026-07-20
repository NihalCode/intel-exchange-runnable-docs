import type { ApiProduct, AuthConfig } from "./types";

const OPEN_API_AUTH: AuthConfig = {
  type: "ctix-open-api",
  description:
    "Cyware Open API authentication. Generate Access ID and Secret Key in your tenant admin panel. " +
    "Each request requires AccessID, Signature (HMAC-SHA1 + Base64), and Expires query parameters.",
  queryParams: [
    { name: "AccessID", placeholder: "YOUR_ACCESS_ID", description: "Open API access ID" },
    { name: "Signature", placeholder: "YOUR_SIGNATURE", description: "HMAC-SHA1 signature" },
    { name: "Expires", placeholder: "YOUR_EXPIRES", description: "Unix expiry timestamp" },
  ],
  credentialFields: ["AccessID", "SecretKey", "Signature", "Expires"],
};

const ORCHESTRATE_AUTH: AuthConfig = {
  type: "orchestrate-open-api",
  description:
    "Cyware Orchestrate Open API authentication. Generate credentials in Orchestrate → Configure Open API. " +
    "Include AccessID, Signature, and Expires in every request query string.",
  queryParams: [
    { name: "AccessID", placeholder: "YOUR_ACCESS_ID" },
    { name: "Signature", placeholder: "YOUR_SIGNATURE" },
    { name: "Expires", placeholder: "YOUR_EXPIRES" },
  ],
  credentialFields: ["AccessID", "SecretKey", "Signature", "Expires"],
};

const CSAP_AUTH: AuthConfig = {
  type: "orchestrate-open-api",
  description:
    "CSAP (Collaborate) Open API authentication. Generate credentials in the Analyst Portal. " +
    "Include AccessID, Signature, and Expires in every request query string.",
  queryParams: [
    { name: "AccessID", placeholder: "YOUR_ACCESS_ID" },
    { name: "Signature", placeholder: "YOUR_SIGNATURE" },
    { name: "Expires", placeholder: "YOUR_EXPIRES" },
  ],
  credentialFields: ["AccessID", "SecretKey", "Signature", "Expires"],
};

const CFTR_AUTH: AuthConfig = {
  type: "orchestrate-open-api",
  description:
    "CFTR Open API authentication. Generate Access ID and Secret Key in CFTR application settings. " +
    "Include AccessID, Signature, and Expires in every request query string.",
  queryParams: [
    { name: "AccessID", placeholder: "YOUR_ACCESS_ID" },
    { name: "Signature", placeholder: "YOUR_SIGNATURE" },
    { name: "Expires", placeholder: "YOUR_EXPIRES" },
  ],
  credentialFields: ["AccessID", "SecretKey", "Signature", "Expires"],
};

/** All supported Cyware API products. Add new products here. */
export const PRODUCTS: ApiProduct[] = [
  {
    productId: "ctix",
    productName: "Intel Exchange",
    displayLabel: "CTIX / Intel Exchange",
    description:
      "Cyware Intel Exchange (CTIX) Open API — threat intelligence ingestion, STIX, tags, reports, and administration.",
    docsUrl: "https://ctixapiv3.cyware.com/intel-exchange-api-reference/intel-exchange-api-reference",
    docsReferencePath: "/intel-exchange-api-reference/intel-exchange-api-reference",
    baseApiUrl: "https://YOUR_TENANT.cyware.com/ctixapi",
    authType: "ctix-open-api",
    auth: OPEN_API_AUTH,
    docsSourceType: "theneo-md",
    docsOrigin: "https://ctixapiv3.cyware.com",
    docsProject: "intel-exchange-api-reference",
    docsReferer:
      "https://ctixapiv3.cyware.com/intel-exchange-api-reference/intel-exchange-api-reference",
    allowedBaseUrlPatterns: [/https:\/\/[^/]*\.cyware\.com\/ctixapi/i],
    indexed: true,
    pageCount: 527,
  },
  {
    productId: "csap",
    productName: "CSAP",
    displayLabel: "CSAP",
    description:
      "Cyware Collaborate (CSAP) API — situational awareness, threat alert sharing, and collaboration workflows.",
    docsUrl: "https://csapapi.cyware.com/",
    docsReferencePath: "/",
    baseApiUrl: "https://csapapi.cyware.com",
    authType: "orchestrate-open-api",
    auth: CSAP_AUTH,
    docsSourceType: "theneo-md",
    docsOrigin: "https://csapapi.cyware.com",
    docsProject: "collaborate-api-reference",
    docsReferer: "https://csapapi.cyware.com/",
    allowedBaseUrlPatterns: [/https:\/\/[^/]*\.cyware\.com\/csap/i, /^https:\/\/csapapi\.cyware\.com/i],
    indexed: true,
    pageCount: 148,
  },
  {
    productId: "orchestrate",
    productName: "Cyware Orchestrate",
    displayLabel: "Cyware Orchestrate",
    description:
      "Cyware Orchestrate API — playbooks, integrations, app store actions, webhooks, and automation.",
    docsUrl: "https://orchestrateapi.cyware.com/cyware-orchestrate-api-reference-theneo",
    docsReferencePath: "/cyware-orchestrate-api-reference-theneo",
    baseApiUrl: "https://orchestrateapi.cyware.com",
    authType: "orchestrate-open-api",
    auth: ORCHESTRATE_AUTH,
    docsSourceType: "theneo-md",
    docsOrigin: "https://orchestrateapi.cyware.com",
    docsProject: "cyware-orchestrate-api-reference-theneo",
    docsReferer: "https://orchestrateapi.cyware.com/cyware-orchestrate-api-reference-theneo",
    allowedBaseUrlPatterns: [
      /https:\/\/[^/]*\.cyware\.com\/co(\/|$|\?)/i,
      /https:\/\/[^/]*\.cyware\.com\/soarapi(\/|$|\?)/i,
      /^https:\/\/orchestrateapi\.cyware\.com/i,
    ],
    indexed: true,
    pageCount: 73,
  },
  {
    productId: "cftr",
    productName: "CFTR",
    displayLabel: "CFTR",
    description:
      "Cyware CFTR API — case management, incidents, playbooks, and security orchestration for CFTR tenants.",
    docsUrl: "https://cftrapi.cyware.com/",
    docsReferencePath: "/",
    baseApiUrl: "https://cftrapi.cyware.com",
    authType: "orchestrate-open-api",
    auth: CFTR_AUTH,
    docsSourceType: "postman",
    docsOrigin: "https://cftrapi.cyware.com",
    docsProject: "cftr-api",
    allowedBaseUrlPatterns: [/https:\/\/[^/]*\.cyware\.com\/cftrapi/i],
    indexed: true,
    pageCount: 209,
  },
];

/** Canonical product identifiers for domain routing and collection scoping. */
export const PRODUCT_KEYS = ["ctix", "cftr", "csap", "orchestrate"] as const;
export type ProductKey = (typeof PRODUCT_KEYS)[number];

export function isProductKey(value: string): value is ProductKey {
  return PRODUCT_KEYS.includes(value as ProductKey);
}

export const DEFAULT_PRODUCT_ID =
  process.env.DEFAULT_PRODUCT_ID?.trim() || "ctix";

export const ALL_PRODUCTS_ID = "all";

export function getProduct(productId: string): ApiProduct | undefined {
  return PRODUCTS.find((p) => p.productId === productId);
}

export function getProductOrThrow(productId: string): ApiProduct {
  const p = getProduct(productId);
  if (!p) throw new Error(`Unknown product: ${productId}`);
  return p;
}

export function listProducts(): ApiProduct[] {
  return PRODUCTS;
}

export function isAllowedBaseUrl(productId: string, url: string): boolean {
  const product = getProduct(productId);
  if (!product) return false;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
    return product.allowedBaseUrlPatterns.some((re) => re.test(url));
  } catch {
    return false;
  }
}

export function docsUrlForSlug(product: ApiProduct, slug: string): string {
  if (product.docsSourceType === "postman") {
    return `${product.docsOrigin}/`;
  }
  return `${product.docsOrigin}/${slug}.md`;
}

/** Human-readable guidance for the live Open API base URL field in API Settings. */
export function apiBaseUrlHint(productId: string): string {
  switch (productId) {
    case "cftr":
      return (
        "https://YOUR-TENANT.cyware.com/cftrapi — live Open API root (not cftrapi.cyware.com, which is docs-only). " +
        "Paths use /openapi/… (e.g. test-connectivity)."
      );
    case "csap":
      return "https://csapapi.cyware.com or your tenant URL https://YOUR_TENANT.cyware.com/csap";
    case "orchestrate":
      return (
        "https://YOUR_TENANT.cyware.com/soarapi/openapi/ (or …/soarapi, or …/co), " +
        "or https://orchestrateapi.cyware.com. Docs paths under /cyware-orchestrate-api-reference-theneo are browsing only."
      );
    case "ctix":
      return "https://YOUR_TENANT.cyware.com/ctixapi (e.g. cs-testv2.cyware.com/ctixapi for Cyware demo tenant)";
    default:
      return getProductOrThrow(productId).baseApiUrl.replace("YOUR_TENANT", "your-tenant");
  }
}

export function inferProductFromQuery(query: string): string | null {
  const products = inferProductsFromQuery(query);
  if (products.length === 0) return null;
  if (products.length === 1) return products[0]!;
  return ALL_PRODUCTS_ID;
}

/** Detect all product mentions in a user message (order preserved, deduped). */
export function inferProductsFromQuery(query: string): string[] {
  const q = query.toLowerCase();
  const found: string[] = [];

  const numbered = q.match(/(?:^|\n)\s*\d+\.\s*(ctix|cftr|csap|orchestrate)\b/);
  if (numbered) return [numbered[1]!];

  const patterns: { id: string; re: RegExp }[] = [
    { id: "cftr", re: /\bcftr\b|\bcyware fusion and threat response\b|\bfusion and threat response\b/ },
    { id: "csap", re: /\bcsap\b|\bcyware situational awareness\b|\bcollaborate\b|\banalyst portal\b/ },
    { id: "orchestrate", re: /\borchestrate\b|\bcyware orchestrate\b|\bco api\b|\bplaybooks?\b/ },
    { id: "ctix", re: /\bctix\b|\bintel exchange api\b|\bintel exchange\b|\bstix\b/ },
  ];

  for (const { id, re } of patterns) {
    if (re.test(q) && !found.includes(id)) found.push(id);
  }

  if (found.length > 1) return found;

  if (
    /\bwhat (cyware )?(products|apis)\b/.test(q) ||
    /\bwhich (products|apis)\b.*\b(documented|available|here)\b/.test(q) ||
    /\b(documented|available)\b.*\b(here|on this site)\b/.test(q) ||
    /\bwhat('s| is) (documented|available)\b/.test(q) ||
    /\ball (cyware )?apis?\b|\bcross[- ]product\b/.test(q) ||
    (/\bcompare\b/.test(q) && found.length === 0)
  ) {
    return [ALL_PRODUCTS_ID];
  }

  return found;
}

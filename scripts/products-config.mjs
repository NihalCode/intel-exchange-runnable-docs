/**
 * Shared product configuration for ingestion and indexing scripts.
 * Keep in sync with src/lib/products/registry.ts
 */

export const PRODUCTS = [
  {
    productId: "ctix",
    productName: "Intel Exchange",
    docsOrigin: "https://ctixapiv3.cyware.com",
    docsProject: "intel-exchange-api-reference",
    docsReferer: undefined,
    docsSourceType: "theneo-md",
    defaultBaseUrl: "https://tenantname.cyware.com/ctixapi",
    /** Legacy path — CTIX pages live at src/content/pages/ */
    legacyContent: true,
  },
  {
    productId: "csap",
    productName: "CSAP",
    docsOrigin: "https://csapapi.cyware.com",
    docsProject: "collaborate-api-reference",
    docsReferer: "https://csapapi.cyware.com/",
    docsSourceType: "theneo-md",
    defaultBaseUrl: "https://csapapi.cyware.com",
    legacyContent: false,
  },
  {
    productId: "orchestrate",
    productName: "Cyware Orchestrate",
    docsOrigin: "https://orchestrateapi.cyware.com",
    docsProject: "cyware-orchestrate-api-reference-theneo",
    docsReferer: "https://orchestrateapi.cyware.com/cyware-orchestrate-api-reference-theneo",
    docsSourceType: "theneo-md",
    defaultBaseUrl: "https://orchestrateapi.cyware.com",
    legacyContent: false,
  },
  {
    productId: "cftr",
    productName: "CFTR",
    docsOrigin: "https://cftrapi.cyware.com",
    docsProject: "cftr-api",
    docsSourceType: "postman",
    postmanCollectionUrl:
      "https://cftrapi.cyware.com/api/collections/4787352/UVeDuTqn?segregateAuth=true&versionTag=latest",
    defaultBaseUrl: "https://cftrapi.cyware.com",
    legacyContent: false,
  },
];

export function getProductConfig(productId) {
  const p = PRODUCTS.find((x) => x.productId === productId);
  if (!p) throw new Error(`Unknown product: ${productId}`);
  return p;
}

export function contentDirForProduct(root, product) {
  if (product.legacyContent) {
    return {
      contentDir: pathJoin(root, "src", "content"),
      pagesDir: pathJoin(root, "src", "content", "pages"),
      manifestPath: pathJoin(root, "src", "content", "manifest.json"),
    };
  }
  const base = pathJoin(root, "src", "content", "products", product.productId);
  return {
    contentDir: base,
    pagesDir: pathJoin(base, "pages"),
    manifestPath: pathJoin(base, "manifest.json"),
  };
}

function pathJoin(...parts) {
  return parts.join("/").replace(/\\/g, "/");
}

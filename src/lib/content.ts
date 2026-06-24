import "server-only";
import { readFile, access } from "node:fs/promises";
import path from "node:path";
import ctixManifest from "@/content/manifest.json";
import { listProducts } from "./products/registry";
import type { ApiProduct } from "./products/types";
import type { DocPage, Manifest } from "./types";

const CONTENT_ROOT = path.join(process.cwd(), "src", "content");
const CTIX_PAGES_DIR = path.join(CONTENT_ROOT, "pages");

function productsDir(productId: string): string {
  return path.join(CONTENT_ROOT, "products", productId);
}

function pagesDirForProduct(productId: string): string {
  if (productId === "ctix") return CTIX_PAGES_DIR;
  return path.join(productsDir(productId), "pages");
}

async function manifestPathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function loadManifestFile(productId: string): Promise<Manifest | null> {
  if (productId === "ctix") {
    return { ...(ctixManifest as Manifest), productId: "ctix", productName: "Intel Exchange" };
  }
  const manifestPath = path.join(productsDir(productId), "manifest.json");
  if (!(await manifestPathExists(manifestPath))) return null;
  const raw = await readFile(manifestPath, "utf8");
  return JSON.parse(raw) as Manifest;
}

/** Load manifest for a product. CTIX uses the legacy root manifest. */
export async function getProductManifest(productId: string): Promise<Manifest | null> {
  return loadManifestFile(productId);
}

export function getManifest(productId = "ctix"): Manifest {
  if (productId !== "ctix") {
    throw new Error(
      `getManifest() is synchronous and only supports CTIX. Use getProductManifest('${productId}') on the server.`
    );
  }
  return { ...(ctixManifest as Manifest), productId: "ctix", productName: "Intel Exchange" };
}

export function normalizeDocSlug(slug: string): string {
  return slug.replace(/^\/+|\/+$/g, "");
}

export function fileNameForSlug(slug: string): string {
  return normalizeDocSlug(slug).replace(/\//g, "__") + ".json";
}

export async function getPage(slug: string): Promise<DocPage | null>;
export async function getPage(productId: string, slug: string): Promise<DocPage | null>;
export async function getPage(
  productIdOrSlug: string,
  maybeSlug?: string
): Promise<DocPage | null> {
  const productId = maybeSlug !== undefined ? productIdOrSlug : "ctix";
  const slug = normalizeDocSlug(maybeSlug !== undefined ? maybeSlug : productIdOrSlug);
  try {
    const file = path.join(pagesDirForProduct(productId), fileNameForSlug(slug));
    const raw = await readFile(file, "utf8");
    return JSON.parse(raw) as DocPage;
  } catch {
    return null;
  }
}

export async function getRootSlug(productId: string): Promise<string> {
  const manifest = await getProductManifest(productId);
  if (!manifest) return productId;
  return manifest.pages[0]?.slug ?? manifest.project;
}

/** CTIX root slug (sync, for legacy routes). */
export function getRootSlugSync(): string {
  const m = getManifest();
  return m.pages[0]?.slug ?? m.project;
}

export async function allSlugsForProduct(productId: string): Promise<string[]> {
  const manifest = await getProductManifest(productId);
  if (!manifest) return [];
  return manifest.pages.map((p) => p.slug);
}

export function allSlugs(): string[] {
  return getManifest().pages.map((p) => p.slug);
}

export interface ProductManifestSummary {
  product: ApiProduct;
  manifest: Manifest | null;
  indexed: boolean;
}

export async function listProductManifests(): Promise<ProductManifestSummary[]> {
  const summaries: ProductManifestSummary[] = [];
  for (const product of listProducts()) {
    const manifest = await getProductManifest(product.productId);
    summaries.push({
      product,
      manifest,
      indexed: Boolean(manifest && manifest.count > 0),
    });
  }
  return summaries;
}

export function docUrl(productId: string, slug: string): string {
  return `/docs/${productId}/${slug}`;
}

export function docsBasePath(productId: string): string {
  return `/docs/${productId}`;
}

import { listProductManifests } from "@/lib/content";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const summaries = await listProductManifests();
  const products = summaries.map(({ product, manifest, indexed }) => ({
    productId: product.productId,
    productName: product.productName,
    displayLabel: product.displayLabel,
    description: product.description,
    docsUrl: product.docsUrl,
    baseApiUrl: product.baseApiUrl,
    authType: product.authType,
    indexed,
    pageCount: manifest?.count ?? 0,
    defaultBaseUrl: manifest?.defaultBaseUrl ?? product.baseApiUrl,
  }));
  return Response.json({ products });
}

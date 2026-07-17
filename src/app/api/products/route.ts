import { listProductManifests } from "@/lib/content";
import { resolveAppProductId } from "@/lib/deployment/resolve-app-product-id";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const pinned = resolveAppProductId();
  const summaries = await listProductManifests();
  const products = summaries
    .filter(({ product }) => !pinned || product.productId === pinned)
    .map(({ product, manifest, indexed }) => ({
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

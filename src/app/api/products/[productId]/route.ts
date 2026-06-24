import { getProductManifest } from "@/lib/content";
import { getProductOrThrow } from "@/lib/products/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ productId: string }> }
) {
  const { productId } = await ctx.params;
  const product = getProductOrThrow(productId);
  const manifest = await getProductManifest(productId);
  return Response.json({
    product: {
      productId: product.productId,
      displayLabel: product.displayLabel,
      docsUrl: product.docsUrl,
      baseApiUrl: product.baseApiUrl,
      auth: product.auth,
    },
    manifest,
    indexed: Boolean(manifest && manifest.count > 0),
  });
}

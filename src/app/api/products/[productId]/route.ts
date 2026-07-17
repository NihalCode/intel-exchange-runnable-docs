import { getProductManifest } from "@/lib/content";
import { resolveAppProductId } from "@/lib/deployment/resolve-app-product-id";
import { getProductOrThrow, isProductKey } from "@/lib/products/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ productId: string }> }
) {
  const { productId } = await ctx.params;
  const pinned = resolveAppProductId();
  if (!isProductKey(productId) || (pinned && productId !== pinned)) {
    return Response.json(
      { error: "Product mismatch", code: "PRODUCT_NOT_SERVED" },
      { status: 404 }
    );
  }
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

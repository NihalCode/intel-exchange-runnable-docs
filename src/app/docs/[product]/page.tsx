import { notFound, redirect } from "next/navigation";
import { getRootSlug } from "@/lib/content";
import { resolveAppProductId } from "@/lib/deployment/resolve-app-product-id";
import { getProductOrThrow } from "@/lib/products/registry";

export default async function ProductDocsIndex({
  params,
}: {
  params: Promise<{ product: string }>;
}) {
  const { product: productId } = await params;
  const pinned = resolveAppProductId();
  if (pinned && productId !== pinned) notFound();
  getProductOrThrow(productId);
  const rootSlug = await getRootSlug(productId);
  redirect(`/docs/${productId}/${rootSlug}`);
}

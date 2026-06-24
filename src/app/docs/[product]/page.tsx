import { redirect } from "next/navigation";
import { getRootSlug } from "@/lib/content";
import { getProductOrThrow } from "@/lib/products/registry";

export default async function ProductDocsIndex({
  params,
}: {
  params: Promise<{ product: string }>;
}) {
  const { product: productId } = await params;
  getProductOrThrow(productId);
  const rootSlug = await getRootSlug(productId);
  redirect(`/docs/${productId}/${rootSlug}`);
}

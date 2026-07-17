import { notFound } from "next/navigation";
import { EndpointView } from "@/components/EndpointView";
import { Markdown } from "@/components/Markdown";
import { ProductBadge } from "@/components/ProductContext";
import { allSlugsForProduct, getPage, getProductManifest, normalizeDocSlug } from "@/lib/content";
import { resolveAppProductId } from "@/lib/deployment/resolve-app-product-id";
import { getProductOrThrow } from "@/lib/products/registry";
import { buildEndpointSnippets } from "@/lib/snippets";
import type { EndpointPage } from "@/lib/types";

export const dynamicParams = false;

export async function generateStaticParams() {
  const pinned = resolveAppProductId();
  const products = pinned
    ? ([pinned] as const)
    : (["ctix", "csap", "orchestrate", "cftr"] as const);
  const params: { product: string; slug: string[] }[] = [];
  for (const productId of products) {
    const slugs = (await allSlugsForProduct(productId))
      .map(normalizeDocSlug)
      .filter(Boolean);
    for (const slug of slugs) {
      params.push({ product: productId, slug: slug.split("/") });
    }
  }
  return params;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ product: string; slug: string[] }>;
}) {
  const { product, slug } = await params;
  const page = await getPage(product, slug.join("/"));
  const p = getProductOrThrow(product);
  return {
    title: page ? `${page.title} — ${p.displayLabel}` : "Not found",
  };
}

export default async function ProductDocPage({
  params,
}: {
  params: Promise<{ product: string; slug: string[] }>;
}) {
  const { product: productId, slug: slugParts } = await params;
  const pinned = resolveAppProductId();
  if (pinned && productId !== pinned) notFound();
  const product = getProductOrThrow(productId);
  const slug = normalizeDocSlug(slugParts.join("/"));
  const manifest = await getProductManifest(productId);

  if (!manifest || manifest.count === 0) {
    return (
      <article className="mx-auto max-w-4xl">
        <ProductBadge productId={productId} />
        <h1 className="mt-4 text-2xl font-bold">{product.displayLabel} — Docs not indexed</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Documentation for {product.displayLabel} has not been ingested yet. Run{" "}
          <code className="rounded bg-zinc-100 px-1 font-mono text-xs dark:bg-zinc-800">
            npm run ingest -- --product={productId}
          </code>{" "}
          to fetch docs from{" "}
          <a href={product.docsUrl} className="text-sky-600 underline" target="_blank" rel="noreferrer">
            {product.docsUrl}
          </a>
          .
        </p>
      </article>
    );
  }

  const page = await getPage(productId, slug);
  if (!page) notFound();

  if (page.kind === "endpoint") {
    const snippets = buildEndpointSnippets(page as EndpointPage, productId);
    return (
      <EndpointView
        page={page as EndpointPage}
        snippets={snippets}
        productId={productId}
        docsUrl={product.docsUrl}
      />
    );
  }

  return (
    <article className="mx-auto max-w-4xl">
      <div className="mb-2 flex items-center gap-2">
        <ProductBadge productId={productId} />
        <a
          href={product.docsUrl}
          className="text-xs text-sky-600 underline"
          target="_blank"
          rel="noreferrer"
        >
          View source docs
        </a>
      </div>
      <h1 className="mb-4 text-2xl font-bold tracking-tight">{page.title}</h1>
      <Markdown>{page.markdown || "_No content._"}</Markdown>
    </article>
  );
}

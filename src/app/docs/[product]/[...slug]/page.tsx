import { notFound } from "next/navigation";
import { EndpointView } from "@/components/EndpointView";
import { Markdown } from "@/components/Markdown";
import { ProductBadge } from "@/components/ProductContext";
import {
  DocsBreadcrumbs,
  DocsPrevNext,
  DocsToc,
} from "@/components/DocsChrome";
import { extractMarkdownHeadings } from "@/lib/extract-markdown-headings";
import {
  allSlugsForProduct,
  getPage,
  getProductManifest,
  normalizeDocSlug,
} from "@/lib/content";
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

async function adjacentPages(productId: string, slug: string) {
  const slugs = (await allSlugsForProduct(productId)).map(normalizeDocSlug).filter(Boolean);
  const idx = slugs.indexOf(slug);
  if (idx < 0) return { prev: null, next: null };
  const prevSlug = idx > 0 ? slugs[idx - 1] : null;
  const nextSlug = idx < slugs.length - 1 ? slugs[idx + 1] : null;
  const [prevPage, nextPage] = await Promise.all([
    prevSlug ? getPage(productId, prevSlug) : Promise.resolve(null),
    nextSlug ? getPage(productId, nextSlug) : Promise.resolve(null),
  ]);
  return {
    prev:
      prevSlug && prevPage
        ? { href: `/docs/${productId}/${prevSlug}`, title: prevPage.title }
        : null,
    next:
      nextSlug && nextPage
        ? { href: `/docs/${productId}/${nextSlug}`, title: nextPage.title }
        : null,
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
      <article className="mx-auto max-w-[var(--content-max)]">
        <DocsBreadcrumbs
          items={[
            { label: "Documentation", href: "/" },
            { label: product.displayLabel },
          ]}
        />
        <ProductBadge productId={productId} />
        <h1 className="mt-4 text-2xl font-bold text-[var(--text-heading)]">
          {product.displayLabel} — Docs not indexed
        </h1>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">
          Documentation for {product.displayLabel} has not been ingested yet. Run{" "}
          <code className="rounded bg-[var(--surface-muted)] px-1 font-mono text-xs">
            npm run ingest -- --product={productId}
          </code>{" "}
          to fetch docs from{" "}
          <a
            href={product.docsUrl}
            className="text-[var(--text-link)] underline"
            target="_blank"
            rel="noreferrer"
          >
            {product.docsUrl}
          </a>
          .
        </p>
      </article>
    );
  }

  const page = await getPage(productId, slug);
  if (!page) notFound();
  const { prev, next } = await adjacentPages(productId, slug);
  const crumbs = [
    { label: "Documentation", href: "/" },
    { label: product.displayLabel, href: `/docs/${productId}` },
    { label: page.title },
  ];

  if (page.kind === "endpoint") {
    const snippets = buildEndpointSnippets(page as EndpointPage, productId);
    return (
      <div className="cx-docs-reader" data-layout="cx-docs-reader" data-has-toc="false">
        <div className="min-w-0">
          <div className="mx-auto max-w-[var(--content-max)]">
            <DocsBreadcrumbs items={crumbs} />
          </div>
          <div data-layout="cx-endpoint-reference">
            <EndpointView
              page={page as EndpointPage}
              snippets={snippets}
              productId={productId}
              docsUrl={product.docsUrl}
            />
          </div>
          <div className="mx-auto max-w-[var(--content-max)]">
            <DocsPrevNext prev={prev} next={next} />
          </div>
        </div>
      </div>
    );
  }

  const markdown = page.markdown || "_No content._";
  const headings = extractMarkdownHeadings(markdown);
  const hasToc = headings.length >= 2;

  return (
    <div
      className="cx-docs-reader"
      data-layout="cx-docs-reader"
      data-has-toc={hasToc ? "true" : "false"}
    >
      <article className="min-w-0 max-w-[var(--article-max)] xl:max-w-none xl:pr-6">
        <DocsBreadcrumbs items={crumbs} />
        <div className="mb-2 flex items-center gap-2">
          <ProductBadge productId={productId} />
          <a
            href={product.docsUrl}
            className="text-xs text-[var(--text-link)] underline"
            target="_blank"
            rel="noreferrer"
          >
            View source docs
          </a>
        </div>
        <h1 className="mb-4 text-3xl font-semibold tracking-tight text-[var(--text-heading)]">
          {page.title}
        </h1>
        <DocsToc headings={headings} variant="inline" />
        <div className="prose-cyware prose max-w-none">
          <Markdown>{markdown}</Markdown>
        </div>
        <DocsPrevNext prev={prev} next={next} />
      </article>
      {hasToc ? <DocsToc headings={headings} variant="rail" /> : null}
    </div>
  );
}

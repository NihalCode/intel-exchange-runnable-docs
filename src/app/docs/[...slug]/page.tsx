import { notFound } from "next/navigation";
import { EndpointView } from "@/components/EndpointView";
import { Markdown } from "@/components/Markdown";
import { allSlugs, getPage } from "@/lib/content";
import { buildEndpointSnippets } from "@/lib/snippets";
import type { EndpointPage } from "@/lib/types";

export const dynamicParams = false;

export function generateStaticParams() {
  return allSlugs().map((slug) => ({ slug: slug.split("/") }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}) {
  const { slug } = await params;
  const page = await getPage(slug.join("/"));
  return { title: page ? `${page.title} — Intel Exchange API` : "Not found" };
}

export default async function DocPage({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}) {
  const { slug } = await params;
  const page = await getPage(slug.join("/"));
  if (!page) notFound();

  if (page.kind === "endpoint") {
    const snippets = buildEndpointSnippets(page as EndpointPage);
    return <EndpointView page={page as EndpointPage} snippets={snippets} />;
  }

  return (
    <article className="mx-auto max-w-4xl">
      <h1 className="mb-4 text-2xl font-bold tracking-tight">{page.title}</h1>
      <Markdown>{page.markdown || "_No content._"}</Markdown>
    </article>
  );
}

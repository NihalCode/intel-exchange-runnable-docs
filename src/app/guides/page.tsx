import type { Metadata } from "next";
import Link from "next/link";

import { ProductBadge } from "@/components/ProductContext";
import { docUrl, getManifest, listProductManifests } from "@/lib/content";
import type { NavNode } from "@/lib/types";

export const metadata: Metadata = {
  title: "Guides — Cyware API Documentation",
  description:
    "Getting started guides, product documentation, and integration workflows for Cyware APIs.",
};

const PLATFORM_GUIDES = [
  {
    href: "/authentication",
    label: "Product authentication",
    description:
      "Connect per-user Open API credentials for CTIX, CSAP, Orchestrate, and CFTR.",
    tag: "Required",
  },
  {
    href: "/agent",
    label: "Documentation Agent",
    description: "Ask questions across product documentation with your connected credentials.",
    tag: "AI",
  },
  {
    href: "/changelog",
    label: "Documentation changelog",
    description: "Review published schema changes, new endpoints, and deprecations.",
    tag: "Updates",
  },
] as const;

function topLevelSections(nav: NavNode[]): NavNode[] {
  return nav.filter((node) => node.kind === "section" && node.slug !== "intel-exchange-api-reference");
}

export default async function GuidesPage() {
  const summaries = await listProductManifests();
  const ctixManifest = getManifest();
  const ctixTopics = topLevelSections(ctixManifest.nav).slice(0, 12);

  return (
    <div className="mx-auto max-w-6xl">
      <section className="mb-10 max-w-3xl border-b border-zinc-200 pb-10 dark:border-zinc-800">
        <p className="text-xs font-semibold uppercase tracking-wide text-sky-600">Guides</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Integration guides</h1>
        <p className="mt-3 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
          Start with authentication, explore product-specific API references, and use runnable
          examples to validate requests before shipping integrations.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-lg font-semibold">Getting started</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Follow these steps to connect credentials and make your first documented API call.
        </p>
        <ol className="mt-5 grid gap-4 md:grid-cols-3">
          <li className="rounded-xl border border-zinc-200 p-5 dark:border-zinc-800">
            <p className="text-xs font-semibold text-sky-600">Step 1</p>
            <h3 className="mt-2 font-semibold">Configure authentication</h3>
            <p className="mt-2 text-xs leading-5 text-zinc-500">
              Add your Open API Access ID and Secret Key for each product you integrate.
            </p>
            <Link href="/authentication" className="mt-4 inline-block text-sm font-medium text-sky-600">
              Open authentication →
            </Link>
          </li>
          <li className="rounded-xl border border-zinc-200 p-5 dark:border-zinc-800">
            <p className="text-xs font-semibold text-sky-600">Step 2</p>
            <h3 className="mt-2 font-semibold">Verify connectivity</h3>
            <p className="mt-2 text-xs leading-5 text-zinc-500">
              Run the Ping endpoint in the browser to confirm credentials and tenant URL.
            </p>
            <Link
              href={docUrl("ctix", "ping/ping")}
              className="mt-4 inline-block text-sm font-medium text-sky-600"
            >
              Run Ping request →
            </Link>
          </li>
          <li className="rounded-xl border border-zinc-200 p-5 dark:border-zinc-800">
            <p className="text-xs font-semibold text-sky-600">Step 3</p>
            <h3 className="mt-2 font-semibold">Browse API topics</h3>
            <p className="mt-2 text-xs leading-5 text-zinc-500">
              Jump into the reference for indicators, administration, reports, and more.
            </p>
            <Link href="/docs/ctix" className="mt-4 inline-block text-sm font-medium text-sky-600">
              Open CTIX reference →
            </Link>
          </li>
        </ol>
      </section>

      <section className="mb-10">
        <h2 className="text-lg font-semibold">Platform guides</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          {PLATFORM_GUIDES.map((guide) => (
            <Link
              key={guide.href}
              href={guide.href}
              className="rounded-xl border border-zinc-200 p-5 transition hover:border-sky-400 dark:border-zinc-800"
            >
              <p className="text-xs font-semibold text-sky-600">{guide.tag}</p>
              <h3 className="mt-2 font-semibold">{guide.label}</h3>
              <p className="mt-2 text-xs leading-5 text-zinc-500">{guide.description}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="mb-10">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-lg font-semibold">Product documentation</h2>
            <p className="mt-1 text-sm text-zinc-500">Choose a product to browse its complete reference.</p>
          </div>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {summaries.map(({ product, manifest, indexed }) => (
            <Link
              key={product.productId}
              href={`/docs/${product.productId}`}
              className="block rounded-xl border border-zinc-200 p-4 transition hover:border-sky-400 dark:border-zinc-800"
            >
              <div className="mb-2 flex items-center gap-2">
                <ProductBadge productId={product.productId} />
                {!indexed ? (
                  <span className="text-[10px] text-amber-600">Not indexed</span>
                ) : (
                  <span className="text-[10px] text-zinc-500">{manifest?.count ?? 0} pages</span>
                )}
              </div>
              <h3 className="font-semibold">{product.displayLabel}</h3>
              <p className="mt-1 text-xs text-zinc-500">{product.description}</p>
            </Link>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold">CTIX API topics</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Top-level sections from the Intel Exchange API reference.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ctixTopics.map((topic) => (
            <Link
              key={topic.slug}
              href={docUrl("ctix", topic.slug)}
              className="rounded-lg border border-zinc-200 px-4 py-3 text-sm transition hover:border-sky-400 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
            >
              <span className="font-medium">{topic.title}</span>
              {topic.children.length > 0 ? (
                <span className="mt-0.5 block text-xs text-zinc-500">
                  {topic.children.length} sub-topics
                </span>
              ) : null}
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

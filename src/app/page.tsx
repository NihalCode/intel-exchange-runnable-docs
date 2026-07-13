import Link from "next/link";
import { ProductBadge } from "@/components/ProductContext";
import { listProductManifests } from "@/lib/content";
import { listProducts } from "@/lib/products/registry";

export default async function Home() {
  const summaries = await listProductManifests();
  const products = listProducts();

  return (
    <div className="mx-auto max-w-6xl">
      <section className="mb-10 border-b border-zinc-200 pb-10 dark:border-zinc-800">
        <p className="text-xs font-semibold uppercase tracking-wide text-sky-600">Cyware developer platform</p>
        <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-tight">
          Build securely with Cyware APIs
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
          Explore API references, integration guides, runnable examples, and product changelogs
          for CTIX, CFTR, CSAP, and Cyware Orchestrate.
        </p>
        <form action="/docs/ctix" className="mt-6 flex max-w-2xl gap-2">
          <input name="q" aria-label="Search documentation" placeholder="Search endpoints, guides, and concepts" className="min-w-0 flex-1 rounded-lg border border-zinc-300 bg-transparent px-4 py-3 text-sm dark:border-zinc-700" />
          <button className="rounded-lg bg-sky-600 px-5 py-3 text-sm font-medium text-white">Search</button>
        </form>
      </section>

      <div className="mb-4 flex items-end justify-between">
        <div>
          <h2 className="text-xl font-semibold">API categories</h2>
          <p className="mt-1 text-sm text-zinc-500">Choose a product to browse its complete reference.</p>
        </div>
        <Link href="/authentication" className="text-sm font-medium text-sky-600">Configure authentication →</Link>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {products.map((product) => {
          const summary = summaries.find((s) => s.product.productId === product.productId);
          const count = summary?.manifest?.count ?? 0;
          const indexed = summary?.indexed ?? false;
          return (
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
                  <span className="text-[10px] text-zinc-500">{count} pages</span>
                )}
              </div>
              <h2 className="font-semibold">{product.displayLabel}</h2>
              <p className="mt-1 text-xs text-zinc-500">{product.description}</p>
            </Link>
          );
        })}
      </div>

      <div className="mt-10 grid gap-4 md:grid-cols-3">
        <Link href="/docs/ctix/getting-started" className="rounded-xl border border-zinc-200 p-5 dark:border-zinc-800">
          <p className="text-xs font-semibold text-sky-600">Quick start</p>
          <h2 className="mt-2 font-semibold">Make your first API request</h2>
          <p className="mt-2 text-xs leading-5 text-zinc-500">Configure product authentication and run a documented request safely.</p>
        </Link>
        <Link href="/agent" className="rounded-xl border border-zinc-200 p-5 dark:border-zinc-800">
          <p className="text-xs font-semibold text-sky-600">Documentation Agent</p>
          <h2 className="mt-2 font-semibold">Ask across product documentation</h2>
          <p className="mt-2 text-xs leading-5 text-zinc-500">A connected product credential is required for per-user AI access.</p>
        </Link>
        <Link href="/changelog" className="rounded-xl border border-zinc-200 p-5 dark:border-zinc-800">
          <p className="text-xs font-semibold text-sky-600">Recently updated</p>
          <h2 className="mt-2 font-semibold">Product changelog</h2>
          <p className="mt-2 text-xs leading-5 text-zinc-500">Review new endpoints, behavior changes, and deprecations.</p>
        </Link>
      </div>
    </div>
  );
}

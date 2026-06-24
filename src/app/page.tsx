import Link from "next/link";
import { ProductBadge } from "@/components/ProductContext";
import { listProductManifests } from "@/lib/content";
import { listProducts } from "@/lib/products/registry";

export default async function Home() {
  const summaries = await listProductManifests();
  const products = listProducts();

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-8 rounded-xl border border-zinc-200 bg-gradient-to-br from-sky-50 to-white p-6 dark:border-zinc-800 dark:from-sky-950/30 dark:to-zinc-950">
        <h1 className="text-3xl font-bold tracking-tight">
          Cyware API Docs — Runnable Reference
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
          Runnable documentation for Cyware product APIs. Select a product, browse endpoints,
          run snippets in the browser, or ask the{" "}
          <Link href="/agent" className="text-sky-600 underline">
            AI agent
          </Link>{" "}
          natural-language questions.
        </p>
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
    </div>
  );
}

import Link from "next/link";
import { ProductBadge } from "@/components/ProductContext";
import { DocsSearch } from "@/components/DocsSearch";
import { listProductManifests } from "@/lib/content";
import { listProducts } from "@/lib/products/registry";
import { productAccentClass } from "@/components/admin/ui/tokens";

export default async function Home() {
  const summaries = await listProductManifests();
  const products = listProducts();

  return (
    <div className="mx-auto max-w-[var(--hub-max)]">
      <section className="mb-10 border-b border-[var(--border-subtle)] pb-10 text-center sm:text-left">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--accent-primary)]">
          Cyware developer platform
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--text-heading)] sm:text-4xl">
          Cyware Technical Documentation
        </h1>
        <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-[var(--text-secondary)] sm:mx-0">
          Search, browse, and explore API references, integration guides, and runnable
          examples for CTIX, CFTR, CSAP, and Cyware Orchestrate.
        </p>
        <div className="mt-6 flex flex-col items-stretch gap-3 sm:items-start">
          <DocsSearch className="w-full" />
          <Link
            href="/agent"
            className="inline-flex w-fit items-center gap-2 rounded-[var(--radius-md)] bg-[var(--accent-ai)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
            data-testid="home-ask-ai"
          >
            <AssistantIcon />
            Ask the Documentation Agent
          </Link>
        </div>
      </section>

      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-[var(--text-heading)]">Products</h2>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Choose a product to browse its complete reference.
          </p>
        </div>
        <Link
          href="/authentication"
          className="shrink-0 text-sm font-medium text-[var(--text-link)] hover:underline"
        >
          Configure authentication →
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2" data-testid="product-hub">
        {products.map((product) => {
          const summary = summaries.find((s) => s.product.productId === product.productId);
          const count = summary?.manifest?.count ?? 0;
          const indexed = summary?.indexed ?? false;
          return (
            <Link
              key={product.productId}
              href={`/docs/${product.productId}`}
              className={`cx-card group block p-5 transition hover:shadow-md ${productAccentClass(product.productId)}`}
            >
              <div className="mb-3 flex items-center gap-2">
                <span
                  className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] text-sm font-bold text-white"
                  style={{ background: "var(--product-accent)" }}
                  aria-hidden="true"
                >
                  {product.displayLabel.slice(0, 1)}
                </span>
                <ProductBadge productId={product.productId} />
                {!indexed ? (
                  <span className="text-[10px] text-[var(--warning)]">Not indexed</span>
                ) : (
                  <span className="text-[10px] text-[var(--text-muted)]">{count} pages</span>
                )}
              </div>
              <h2 className="font-semibold text-[var(--text-heading)] group-hover:text-[var(--text-link)]">
                {product.displayLabel}
              </h2>
              <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">
                {product.description}
              </p>
              <p className="mt-3 text-xs font-medium text-[var(--text-link)]">
                API Documentation →
              </p>
            </Link>
          );
        })}
      </div>

      <div className="mt-10 grid gap-4 md:grid-cols-3">
        <Link href="/guides" className="cx-card block p-5">
          <p className="text-xs font-semibold text-[var(--accent-primary)]">Quick start</p>
          <h2 className="mt-2 font-semibold text-[var(--text-heading)]">
            Make your first API request
          </h2>
          <p className="mt-2 text-xs leading-5 text-[var(--text-secondary)]">
            Configure product authentication and run a documented request safely.
          </p>
        </Link>
        <Link href="/agent" className="cx-card block p-5">
          <p className="text-xs font-semibold text-[var(--accent-ai)]">Documentation Agent</p>
          <h2 className="mt-2 font-semibold text-[var(--text-heading)]">
            Ask across product documentation
          </h2>
          <p className="mt-2 text-xs leading-5 text-[var(--text-secondary)]">
            A connected product credential is required for per-user AI access.
          </p>
        </Link>
        <Link href="/changelog" className="cx-card block p-5">
          <p className="text-xs font-semibold text-[var(--accent-primary)]">Recently updated</p>
          <h2 className="mt-2 font-semibold text-[var(--text-heading)]">Product changelog</h2>
          <p className="mt-2 text-xs leading-5 text-[var(--text-secondary)]">
            Review new endpoints, behavior changes, and deprecations.
          </p>
        </Link>
      </div>
    </div>
  );
}

function AssistantIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3zM5 16l.8 2.2L8 19l-2.2.8L5 22l-.8-2.2L2 19l2.2-.8L5 16zM18 14l.6 1.8L20.4 16.4 18.6 17 18 18.8l-.6-1.8L15.6 16.4l1.8-.6L18 14z" strokeLinejoin="round" />
    </svg>
  );
}

import Link from "next/link";
import { ProductBadge } from "@/components/ProductContext";
import { DocsSearch } from "@/components/DocsSearch";
import { CxPage, CxProductCard, CxSection } from "@/components/cx";
import { listProductManifests } from "@/lib/content";
import { listProducts } from "@/lib/products/registry";
import { productAccentClass } from "@/components/admin/ui/tokens";

export default async function Home() {
  const summaries = await listProductManifests();
  const products = listProducts();

  return (
    <div data-layout="cx-home-hub">
      <section className="cx-hub-hero" data-layout="cx-hub-hero">
        <CxPage layout="hub" className="px-4 sm:px-8">
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--accent-primary)]">
            Cyware Technical Documentation
          </p>
          <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-tight text-[var(--text-heading)] sm:text-5xl">
            Find product docs, API references, and release notes
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-[var(--text-secondary)]">
            Search across Intel Exchange, Respond, Collaborate, and Orchestrate — then open
            runnable examples or ask the Documentation Agent.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-stretch">
            <DocsSearch
              className="w-full flex-1"
              size="hub"
              placeholder="Search documentation, endpoints, and concepts"
            />
            <Link
              href="/agent"
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-[var(--radius-md)] bg-[var(--accent-ai)] px-5 py-3 text-sm font-semibold text-white hover:opacity-90"
              data-testid="home-ask-ai"
            >
              <AssistantIcon />
              Ask AI
            </Link>
          </div>
        </CxPage>
      </section>

      <CxPage layout="hub" className="px-4 sm:px-8">
        <CxSection
          eyebrow="Products"
          title="Documentation by product"
          description="Open the API reference for each Cyware product. Page counts reflect the currently indexed corpus."
          actions={
            <Link
              href="/authentication"
              className="text-sm font-medium text-[var(--text-link)] hover:underline"
            >
              Configure authentication →
            </Link>
          }
        >
          <div
            className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
            data-testid="product-hub"
            data-layout="cx-product-collection"
          >
            {products.map((product) => {
              const summary = summaries.find((s) => s.product.productId === product.productId);
              const count = summary?.manifest?.count ?? 0;
              const indexed = summary?.indexed ?? false;
              return (
                <CxProductCard
                  key={product.productId}
                  href={`/docs/${product.productId}`}
                  title={product.displayLabel}
                  description={product.description}
                  accentClass={productAccentClass(product.productId)}
                  initial={product.productId === "orchestrate" ? "OR" : product.productId.slice(0, 2)}
                  badge={<ProductBadge productId={product.productId} />}
                  meta={
                    !indexed ? (
                      <span className="text-[10px] font-medium leading-none text-[var(--warning)]">
                        Not indexed
                      </span>
                    ) : (
                      <span className="text-[10px] font-medium leading-none text-[var(--text-muted)]">
                        {count} pages
                      </span>
                    )
                  }
                  footer="API documentation →"
                />
              );
            })}
          </div>
        </CxSection>

        <CxSection
          eyebrow="API documentation"
          title="Start from a common path"
          description="Jump into guides, agent answers, or recent product changes."
        >
          <div className="grid gap-4 md:grid-cols-3" data-layout="cx-resource-grid">
            <Link href="/guides" className="cx-card block p-5" data-layout="cx-resource-card">
              <p className="text-xs font-semibold text-[var(--accent-primary)]">Guides</p>
              <h2 className="mt-2 font-semibold text-[var(--text-heading)]">
                Make your first API request
              </h2>
              <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                Configure product authentication and run a documented request safely.
              </p>
            </Link>
            <Link href="/agent" className="cx-card block p-5" data-layout="cx-resource-card">
              <p className="text-xs font-semibold text-[var(--accent-ai)]">Ask AI</p>
              <h2 className="mt-2 font-semibold text-[var(--text-heading)]">
                Ask across product documentation
              </h2>
              <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                Get plain-language answers with sources from the indexed docs.
              </p>
            </Link>
            <Link href="/changelog" className="cx-card block p-5" data-layout="cx-resource-card">
              <p className="text-xs font-semibold text-[var(--accent-primary)]">Release notes</p>
              <h2 className="mt-2 font-semibold text-[var(--text-heading)]">Product changelog</h2>
              <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                Review new endpoints, behavior changes, and deprecations.
              </p>
            </Link>
          </div>
        </CxSection>
      </CxPage>
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

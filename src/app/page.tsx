import Link from "next/link";
import { TopologyField, ThreatBadge, TelemetryValue, LiveStatus } from "@/components/atlas";
import { listProductManifests } from "@/lib/content";
import { listProducts } from "@/lib/products/registry";
import { productAccentClass } from "@/components/admin/ui/tokens";

const TICKER = [
  "CTIX · indicator correlation spike",
  "CFTR · incident packet inbound",
  "CSAP · collaboration thread verified",
  "Orchestrate · playbook edge hot",
  "Unanswered queries · triage queue armed",
  "Ask AI · grounded retrieval ready",
];

export default async function Home() {
  const summaries = await listProductManifests();
  const products = listProducts();
  const indexedPages = summaries.reduce((n, s) => n + (s.manifest?.count ?? 0), 0);
  const defaultDocs = products[0]?.productId ?? "ctix";

  return (
    <div data-layout="cx-home-hub" data-atlas-surface="intelligence-field">
      <section className="atlas-hero" data-layout="cx-hub-hero" data-testid="atlas-hero">
        <div className="atlas-hero__grid">
          <div>
            <p className="atlas-micro-label atlas-hero__eyebrow">Living Signal Atlas · Overview</p>
            <h1 className="atlas-hero__title">Cyware API documentation you can run.</h1>
            <p className="atlas-hero__lede">
              Search product docs, ask AI for grounded answers, explore live APIs, and build apps —
              across CTIX, CSAP, Orchestrate, and CFTR — without leaving this workspace.
            </p>
            <div className="atlas-hero__actions">
              <Link href="/agent" className="atlas-btn-primary" data-testid="home-ask-ai">
                Ask AI
              </Link>
              <Link
                href={`/docs/${defaultDocs}`}
                className="atlas-btn-ghost"
                data-testid="home-open-docs"
              >
                Open documentation
              </Link>
            </div>
            <div className="atlas-hero__readouts" aria-label="Workspace status">
              <TelemetryValue label="Indexed pages" value={indexedPages || "—"} />
              <TelemetryValue label="Products" value={products.length} />
              <div className="atlas-telemetry">
                <span className="atlas-micro-label">Status</span>
                <LiveStatus label="Live" />
              </div>
            </div>
            <nav className="atlas-hero__quicklinks" aria-label="Quick destinations">
              <Link href="/agent">Ask AI</Link>
              <Link href={`/docs/${defaultDocs}`}>Documentation</Link>
              <Link href="/developer">API Explorer</Link>
              <Link href="/agent?focus=build">Build App</Link>
              <Link href="/authentication">Credentials</Link>
              <Link href="/guides">Guides</Link>
            </nav>
          </div>
          <div className="atlas-hero__panel">
            <TopologyField />
          </div>
        </div>
        <div className="atlas-ticker" aria-label="Live activity ticker">
          <div className="atlas-ticker__track">
            {[...TICKER, ...TICKER].map((item, i) => (
              <span key={`${item}-${i}`}>{item}</span>
            ))}
          </div>
        </div>
      </section>

      <section className="atlas-section">
        <p className="atlas-micro-label">Get started</p>
        <h2 className="atlas-section__title">What you can do next</h2>
        <p className="atlas-section__lede">
          Choose a workflow — ask questions, call APIs, or open a product&apos;s documentation tree.
        </p>
        <div className="atlas-stream">
          <StreamItem
            tone="signal"
            title="Ask AI"
            body="Evidence-backed answers grounded in the indexed API documentation."
            href="/agent"
            cta="Open Ask AI"
          />
          <StreamItem
            tone="violet"
            title="API Explorer"
            body="Send authenticated requests through the secure developer console."
            href="/developer"
            cta="Open explorer"
          />
          <StreamItem
            tone="amber"
            title="Credentials"
            body="Configure product Open API credentials for this browser session only."
            href="/authentication"
            cta="Configure"
          />
          <StreamItem
            tone="signal"
            title="Build App"
            body="Generate, preview, and deploy apps from Ask AI when Build App is enabled."
            href="/agent?focus=build"
            cta="Open Build App"
          />
        </div>
      </section>

      <section className="atlas-section" data-testid="product-hub">
        <p className="atlas-micro-label">Products</p>
        <h2 className="atlas-section__title">Browse documentation by product</h2>
        <p className="atlas-section__lede">
          Each product opens its documentation tree and runnable request examples.
        </p>
        <div className="atlas-product-constellation">
          {products.map((product) => {
            const summary = summaries.find((s) => s.product.productId === product.productId);
            const count = summary?.manifest?.count ?? 0;
            const indexed = summary?.indexed ?? false;
            return (
              <Link
                key={product.productId}
                href={`/docs/${product.productId}`}
                className={`atlas-product-node ${productAccentClass(product.productId)}`}
              >
                <ThreatBadge tone="signal">{product.productId}</ThreatBadge>
                <div className="atlas-product-node__name">{product.displayLabel}</div>
                <p className="atlas-product-node__desc">{product.description}</p>
                <p className="atlas-micro-label mt-3">
                  {indexed ? `${count} pages indexed` : "Corpus pending"}
                </p>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="atlas-section">
        <p className="atlas-micro-label">Learn more</p>
        <div className="atlas-stream">
          <StreamItem
            tone="muted"
            title="Guides"
            body="Operator playbooks and onboarding paths."
            href="/guides"
            cta="Read guides"
          />
          <StreamItem
            tone="muted"
            title="Changelog"
            body="Release notes across the documentation platform."
            href="/changelog"
            cta="View changelog"
          />
        </div>
      </section>
    </div>
  );
}

function StreamItem({
  tone,
  title,
  body,
  href,
  cta,
}: {
  tone: "signal" | "amber" | "violet" | "muted";
  title: string;
  body: string;
  href: string;
  cta: string;
}) {
  return (
    <div className="atlas-stream__item">
      <ThreatBadge tone={tone === "muted" ? "muted" : tone}>{tone}</ThreatBadge>
      <div>
        <p className="text-sm font-medium text-[var(--text-heading)]">{title}</p>
        <p className="mt-0.5 text-sm text-[var(--text-secondary)]">{body}</p>
      </div>
      <Link href={href} className="atlas-btn-ghost atlas-btn-sm whitespace-nowrap">
        {cta}
      </Link>
    </div>
  );
}

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
  "Unknown signals · triage queue armed",
  "Ask Intelligence · grounded retrieval ready",
];

export default async function Home() {
  const summaries = await listProductManifests();
  const products = listProducts();
  const indexedPages = summaries.reduce((n, s) => n + (s.manifest?.count ?? 0), 0);

  return (
    <div data-layout="cx-home-hub" data-atlas-surface="intelligence-field">
      <section className="atlas-hero" data-layout="cx-hub-hero" data-testid="atlas-hero">
        <div className="atlas-hero__grid">
          <div>
            <p className="atlas-micro-label atlas-hero__eyebrow">Living Signal Atlas</p>
            <h1 className="atlas-hero__title">See the threat before it forms.</h1>
            <p className="atlas-hero__lede">
              Signals enter the network, correlate across Cyware products, and surface as
              actionable knowledge — runnable documentation, Ask Intelligence, and operational
              control in one atlas.
            </p>
            <div className="atlas-hero__actions">
              <Link href="/agent" className="atlas-btn-primary" data-testid="home-ask-ai">
                Ask Intelligence
              </Link>
              <Link href="/docs/ctix" className="atlas-btn-ghost" data-testid="home-open-docs">
                Enter Knowledge Atlas
              </Link>
            </div>
            <div className="atlas-hero__readouts">
              <TelemetryValue label="Indexed pages" value={indexedPages || "—"} />
              <TelemetryValue label="Products" value={products.length} />
              <div className="atlas-telemetry">
                <span className="atlas-micro-label">Network</span>
                <LiveStatus label="Live" />
              </div>
            </div>
          </div>
          <div className="atlas-hero__panel">
            <TopologyField />
          </div>
        </div>
        <div className="atlas-ticker" aria-label="Live threat ticker">
          <div className="atlas-ticker__track">
            {[...TICKER, ...TICKER].map((item, i) => (
              <span key={`${item}-${i}`}>{item}</span>
            ))}
          </div>
        </div>
      </section>

      <section className="atlas-section">
        <p className="atlas-micro-label">Priority stream</p>
        <h2 className="atlas-section__title">Operational intelligence now</h2>
        <p className="atlas-section__lede">
          Move from observation to action — investigate with Ask Intelligence, execute against
          live APIs, or open the product knowledge surface.
        </p>
        <div className="atlas-stream">
          <StreamItem
            tone="signal"
            title="Ask Intelligence workstation"
            body="Evidence-backed answers grounded in the indexed API corpus."
            href="/agent"
            cta="Open"
          />
          <StreamItem
            tone="violet"
            title="API Live Console"
            body="Transmit authenticated requests through the secure proxy laboratory."
            href="/developer"
            cta="Transmit"
          />
          <StreamItem
            tone="amber"
            title="Credentials & clearance"
            body="Configure product Open API credentials for this session only."
            href="/authentication"
            cta="Configure"
          />
        </div>
      </section>

      <section className="atlas-section" data-testid="product-hub">
        <p className="atlas-micro-label">Product constellation</p>
        <h2 className="atlas-section__title">Interconnected Cyware ecosystem</h2>
        <p className="atlas-section__lede">
          Each product is a living region of the atlas — open its documentation tree and runnable
          request deck.
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
        <p className="atlas-micro-label">Secondary lanes</p>
        <div className="atlas-stream">
          <StreamItem tone="muted" title="Guides" body="Operator playbooks and onboarding paths." href="/guides" cta="Read" />
          <StreamItem tone="muted" title="Changelog" body="Release notes across the documentation fabric." href="/changelog" cta="Review" />
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

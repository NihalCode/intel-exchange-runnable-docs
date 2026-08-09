import type { Metadata } from "next";
import Link from "next/link";

import { ThreatBadge } from "@/components/atlas";
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
    tone: "amber" as const,
  },
  {
    href: "/agent",
    label: "Documentation Agent",
    description: "Ask questions across product documentation with your connected credentials.",
    tag: "AI",
    tone: "signal" as const,
  },
  {
    href: "/changelog",
    label: "Documentation changelog",
    description: "Review published schema changes, new endpoints, and deprecations.",
    tag: "Updates",
    tone: "violet" as const,
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
    <div data-layout="cx-guides-page" data-atlas-surface="guides">
      <section className="atlas-section">
        <p className="atlas-micro-label">System · Guides</p>
        <h1 className="atlas-section__title text-3xl">Integration guides</h1>
        <p className="atlas-section__lede">
          Start with authentication, explore product-specific API references, and use runnable
          examples to validate requests before shipping integrations.
        </p>
      </section>

      <section className="atlas-section">
        <p className="atlas-micro-label">Getting started</p>
        <h2 className="atlas-section__title">Connect, verify, explore</h2>
        <p className="atlas-section__lede">
          Follow these steps to connect credentials and make your first documented API call.
        </p>
        <div className="atlas-stream">
          <div className="atlas-stream__item">
            <ThreatBadge tone="signal">Step 1</ThreatBadge>
            <div>
              <p className="text-sm font-medium text-[var(--text-heading)]">Configure credentials</p>
              <p className="mt-0.5 text-sm text-[var(--text-secondary)]">
                Add your Open API Access ID and Secret Key for each product you integrate.
              </p>
            </div>
            <Link href="/authentication" className="atlas-btn-ghost atlas-btn-sm whitespace-nowrap">
              Open authentication →
            </Link>
          </div>
          <div className="atlas-stream__item">
            <ThreatBadge tone="violet">Step 2</ThreatBadge>
            <div>
              <p className="text-sm font-medium text-[var(--text-heading)]">Verify connectivity</p>
              <p className="mt-0.5 text-sm text-[var(--text-secondary)]">
                Run the Ping endpoint in the browser to confirm credentials and tenant URL.
              </p>
            </div>
            <Link
              href={docUrl("ctix", "ping/ping")}
              className="atlas-btn-ghost atlas-btn-sm whitespace-nowrap"
            >
              Run Ping request →
            </Link>
          </div>
          <div className="atlas-stream__item">
            <ThreatBadge tone="amber">Step 3</ThreatBadge>
            <div>
              <p className="text-sm font-medium text-[var(--text-heading)]">Browse API topics</p>
              <p className="mt-0.5 text-sm text-[var(--text-secondary)]">
                Jump into the reference for indicators, administration, reports, and more.
              </p>
            </div>
            <Link href="/docs/ctix" className="atlas-btn-ghost atlas-btn-sm whitespace-nowrap">
              Open CTIX reference →
            </Link>
          </div>
        </div>
      </section>

      <section className="atlas-section">
        <p className="atlas-micro-label">Platform guides</p>
        <h2 className="atlas-section__title">Operational lanes</h2>
        <div className="atlas-stream">
          {PLATFORM_GUIDES.map((guide) => (
            <div key={guide.href} className="atlas-stream__item">
              <ThreatBadge tone={guide.tone}>{guide.tag}</ThreatBadge>
              <div>
                <p className="text-sm font-medium text-[var(--text-heading)]">{guide.label}</p>
                <p className="mt-0.5 text-sm text-[var(--text-secondary)]">{guide.description}</p>
              </div>
              <Link href={guide.href} className="atlas-btn-ghost atlas-btn-sm whitespace-nowrap">
                Open
              </Link>
            </div>
          ))}
        </div>
      </section>

      <section className="atlas-section">
        <p className="atlas-micro-label">Product constellation</p>
        <h2 className="atlas-section__title">Product documentation</h2>
        <p className="atlas-section__lede">Choose a product to browse its complete reference.</p>
        <div className="atlas-product-constellation">
          {summaries.map(({ product, manifest, indexed }) => (
            <Link
              key={product.productId}
              href={`/docs/${product.productId}`}
              className="atlas-product-node"
            >
              <div className="mb-2 flex items-center gap-2">
                <ProductBadge productId={product.productId} />
                {!indexed ? (
                  <ThreatBadge tone="amber">Not indexed</ThreatBadge>
                ) : (
                  <span className="atlas-micro-label">{manifest?.count ?? 0} pages</span>
                )}
              </div>
              <div className="atlas-product-node__name">{product.displayLabel}</div>
              <p className="atlas-product-node__desc">{product.description}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="atlas-section">
        <p className="atlas-micro-label">Documentation</p>
        <h2 className="atlas-section__title">CTIX API topics</h2>
        <p className="atlas-section__lede">
          Top-level sections from the Intel Exchange API reference.
        </p>
        <div className="atlas-stream">
          {ctixTopics.map((topic) => (
            <div key={topic.slug} className="atlas-stream__item">
              <ThreatBadge tone="muted">Topic</ThreatBadge>
              <div>
                <p className="text-sm font-medium text-[var(--text-heading)]">{topic.title}</p>
                {topic.children.length > 0 ? (
                  <p className="mt-0.5 text-sm text-[var(--text-secondary)]">
                    {topic.children.length} sub-topics
                  </p>
                ) : null}
              </div>
              <Link
                href={docUrl("ctix", topic.slug)}
                className="atlas-btn-ghost atlas-btn-sm whitespace-nowrap"
              >
                Open
              </Link>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

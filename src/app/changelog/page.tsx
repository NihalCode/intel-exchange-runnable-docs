import Link from "next/link";

export default function ChangelogPage() {
  return (
    <div data-layout="cx-changelog-page" data-atlas-surface="changelog">
      <section className="atlas-section">
        <p className="atlas-micro-label">System · Changelog</p>
        <h1 className="atlas-section__title text-3xl">Documentation changelog</h1>
        <p className="atlas-section__lede">
          Published documentation updates and API deprecations appear here when your workspace
          publishes release notes.
        </p>
      </section>

      <section className="atlas-section">
        <div className="atlas-empty" data-testid="changelog-empty">
          <p className="atlas-micro-label">No signal</p>
          <h2 className="atlas-empty__title">No published changes yet</h2>
          <p className="atlas-empty__desc">
            Browse the latest API reference while release notes are being prepared, or ask the
            Documentation Agent about recent endpoint behavior.
          </p>
          <div className="atlas-empty__action flex flex-wrap items-center gap-3">
            <Link href="/docs/ctix" className="atlas-btn-primary atlas-btn-sm">
              Browse API reference
            </Link>
            <Link href="/agent" className="atlas-btn-ghost atlas-btn-sm">
              Ask the Documentation Agent
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

import Link from "next/link";

export default function ChangelogPage() {
  return (
    <div className="mx-auto max-w-4xl" data-layout="cx-changelog-page">
      <h1 className="text-3xl font-semibold tracking-tight text-[var(--text-heading)]">
        Documentation changelog
      </h1>
      <p className="mt-3 text-sm text-[var(--text-secondary)]">
        Published documentation updates and API deprecations appear here when your workspace
        publishes release notes.
      </p>
      <div
        className="mt-8 rounded-xl border border-[var(--border-default)] bg-[var(--surface-sunken)] p-8 text-center"
        data-testid="changelog-empty"
      >
        <p className="text-sm font-medium text-[var(--text-heading)]">No published changes yet</p>
        <p className="mx-auto mt-2 max-w-md text-sm text-[var(--text-secondary)]">
          Browse the latest API reference while release notes are being prepared, or ask the
          Documentation Agent about recent endpoint behavior.
        </p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/docs/ctix"
            className="rounded-[var(--radius-md)] bg-[var(--accent-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            Browse API reference
          </Link>
          <Link
            href="/agent"
            className="rounded-[var(--radius-md)] border border-[var(--border-default)] px-4 py-2 text-sm font-medium text-[var(--text-heading)] hover:bg-[var(--surface-muted)]"
          >
            Ask the Documentation Agent
          </Link>
        </div>
      </div>
    </div>
  );
}

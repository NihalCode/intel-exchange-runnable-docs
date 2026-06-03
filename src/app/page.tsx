import Link from "next/link";
import { Markdown } from "@/components/Markdown";
import { getManifest, getPage, getRootSlug } from "@/lib/content";

export default async function Home() {
  const manifest = getManifest();
  const rootSlug = getRootSlug();
  const page = await getPage(rootSlug);
  const topSections = manifest.nav.slice(0, 12);

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-8 rounded-xl border border-zinc-200 bg-gradient-to-br from-sky-50 to-white p-6 dark:border-zinc-800 dark:from-sky-950/30 dark:to-zinc-950">
        <h1 className="text-3xl font-bold tracking-tight">
          Intel Exchange API — Runnable Reference
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
          An unofficial, runnable mirror of the Cyware Intel Exchange API reference.
          Every code snippet has a <strong>Run</strong> control: execute API calls
          through a secure proxy, validate JSON, or run JavaScript in a sandbox — no
          copy/paste required. {manifest.count} pages indexed.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {topSections.map((s) => (
            <Link
              key={s.slug}
              href={`/docs/${s.slug}`}
              className="rounded-full border border-zinc-300 px-3 py-1 text-xs font-medium text-zinc-700 transition hover:border-sky-400 hover:text-sky-600 dark:border-zinc-700 dark:text-zinc-300"
            >
              {s.title}
            </Link>
          ))}
        </div>
      </div>

      {page && page.kind === "section" ? (
        <Markdown>{page.markdown}</Markdown>
      ) : null}
    </div>
  );
}

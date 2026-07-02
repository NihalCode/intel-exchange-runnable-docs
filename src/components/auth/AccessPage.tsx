import Link from "next/link";

export function AccessPage({
  title,
  description,
  children,
  testId,
}: {
  title: string;
  description: string;
  children?: React.ReactNode;
  testId?: string;
}) {
  return (
    <main
      data-testid={testId}
      className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 py-12 dark:bg-zinc-950"
    >
      <div className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mb-2 flex items-center gap-2">
          <span className="rounded bg-sky-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
            RUNNABLE
          </span>
          <span className="text-xs text-zinc-500 dark:text-zinc-400">Cyware API Docs</span>
        </div>
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">{title}</h1>
        <p className="mt-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
          {description}
        </p>
        {children}
        <div className="mt-8 flex flex-col gap-2">
          <Link
            href="/sign-in"
            className="inline-flex items-center justify-center rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
          >
            Back to sign in
          </Link>
        </div>
      </div>
    </main>
  );
}

"use client";

interface Props {
  title: string;
  secret: string;
  description: string;
  onClose: () => void;
}

export function OneTimeSecretModal({ title, secret, description, onClose }: Props) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="one-time-secret-title"
    >
      <div className="w-full max-w-lg rounded-lg border border-zinc-200 bg-white p-6 shadow-xl dark:border-zinc-700 dark:bg-zinc-950">
        <h2 id="one-time-secret-title" className="text-lg font-semibold">
          {title}
        </h2>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
          {description}
        </p>
        <pre className="mt-4 overflow-x-auto rounded-md border border-amber-300 bg-amber-50 p-3 font-mono text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
          {secret}
        </pre>
        <p className="mt-3 text-sm font-medium text-amber-800 dark:text-amber-200">
          Copy this value now. It will not be shown again.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 dark:border-zinc-700 dark:hover:bg-zinc-900"
            onClick={() => void navigator.clipboard.writeText(secret)}
          >
            Copy
          </button>
          <button
            type="button"
            className="rounded-md bg-sky-700 px-3 py-2 text-sm font-medium text-white hover:bg-sky-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600"
            onClick={onClose}
          >
            I have saved it
          </button>
        </div>
      </div>
    </div>
  );
}

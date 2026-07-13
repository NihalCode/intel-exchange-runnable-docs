/** Shared Tailwind class tokens for the enterprise admin dashboard. */

export const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-zinc-950";

export const inputClass = `rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-sky-600 dark:border-zinc-700 dark:bg-zinc-950 ${focusRing}`;

export const buttonPrimaryClass = `rounded-md bg-sky-700 px-3 py-2 text-sm font-medium text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none ${focusRing}`;

export const buttonSecondaryClass = `rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900 ${focusRing}`;

export const buttonDangerClass = `rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm font-medium text-red-800 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-900 dark:bg-red-950 dark:text-red-200 dark:hover:bg-red-900 ${focusRing}`;

export const cardClass =
  "rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950";

export const tableClass = "w-full min-w-[640px] text-left text-sm";

export const linkClass = `rounded-md text-sky-700 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 dark:text-sky-400 ${focusRing}`;

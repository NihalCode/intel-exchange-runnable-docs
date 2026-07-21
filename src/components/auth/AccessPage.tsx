import Link from "next/link";
import { buttonPrimaryClass } from "@/components/admin/ui/tokens";

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
      className="flex min-h-screen items-center justify-center bg-[var(--background-page)] px-4 py-12"
    >
      <div className="cx-card w-full max-w-md p-8">
        <div className="mb-3 flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/cyware_logo.png"
            alt=""
            width={28}
            height={28}
            className="h-7 w-7 object-contain"
          />
          <span className="text-xs font-medium text-[var(--text-secondary)]">
            Cyware API Docs
          </span>
        </div>
        <h1 className="text-xl font-semibold text-[var(--text-heading)]">{title}</h1>
        <p className="mt-3 text-sm leading-relaxed text-[var(--text-secondary)]">
          {description}
        </p>
        {children}
        <div className="mt-8 flex flex-col gap-2">
          <Link href="/sign-in" className={buttonPrimaryClass}>
            Back to sign in
          </Link>
        </div>
      </div>
    </main>
  );
}

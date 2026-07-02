import { ContentManagementPanel } from "@/components/auth/ContentManagementPanel";

export const metadata = {
  title: "Content — Cyware API Docs",
};

export default function SettingsContentPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
        Settings → Content
      </h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        Sync documentation from upstream sources or import Postman collections. For documentation
        managers and admins — uses your signed-in workspace account.
      </p>
      <div className="mt-8">
        <ContentManagementPanel />
      </div>
    </div>
  );
}

import { UsersManagementPanel } from "@/components/auth/UsersManagementPanel";

export const metadata = {
  title: "Users — Cyware API Docs",
};

export default function SettingsUsersPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">Settings → Users</h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        Invite teammates and manage documentation workspace access. Only owners and admins can
        manage users.
      </p>
      <div className="mt-8">
        <UsersManagementPanel />
      </div>
    </div>
  );
}

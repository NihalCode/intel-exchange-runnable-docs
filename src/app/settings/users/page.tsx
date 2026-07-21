import { UsersManagementPanel } from "@/components/auth/UsersManagementPanel";

export const metadata = {
  title: "Users — Cyware API Docs",
};

export default function SettingsUsersPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="text-2xl font-semibold text-[var(--text-heading)]">Settings → Users</h1>
      <p className="mt-2 text-sm text-[var(--text-secondary)]">
        Create invite links and manage documentation workspace access. Share each link with the
        invited person yourself. Only owners and admins can manage users.
      </p>
      <div className="mt-8">
        <UsersManagementPanel />
      </div>
    </div>
  );
}

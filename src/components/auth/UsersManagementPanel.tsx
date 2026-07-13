"use client";

import { useCallback, useEffect, useState } from "react";

import { useDocumentationAuth } from "@/components/auth/DocumentationAuthProvider";
import type { DocumentationRole } from "@/lib/documentation-auth/types";
import { DOCUMENTATION_ROLES } from "@/lib/documentation-auth/types";

interface UserRow {
  id: string;
  email: string;
  name?: string | null;
  role: DocumentationRole;
  status: string;
  lastLoginAt?: string | null;
}

async function csrfToken() {
  const response = await fetch("/api/admin/control-plane/context", { cache: "no-store" });
  return ((await response.json()) as { csrfToken: string }).csrfToken;
}

export function UsersManagementPanel() {
  const { state, hasPermission } = useDocumentationAuth();
  const canManage = hasPermission("manage_users");
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<DocumentationRole>("viewer");
  const [expiresAt, setExpiresAt] = useState("");
  const [status, setStatus] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/users", { cache: "no-store" });
      if (!response.ok) return setError("Could not load users.");
      setUsers(((await response.json()) as { users: UserRow[] }).users);
    } catch {
      setError("Could not load users.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      if (!state.loading && canManage) void load();
      else if (!state.loading) setLoading(false);
    });
  }, [canManage, load, state.loading]);

  async function addUser(event: React.FormEvent) {
    event.preventDefault();
    setBusy("add");
    setError(null);
    setStatus("");
    try {
      const response = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": await csrfToken() },
        body: JSON.stringify({ email, name, role, expiresAt: expiresAt || null }),
      });
      const data = (await response.json()) as { error?: string; setupStatus?: string };
      if (!response.ok) return setError(data.error ?? "User provisioning failed.");
      setStatus(
        data.setupStatus === "provider_setup_created"
          ? "User added. Auth0 setup is ready for provider-managed completion."
          : "User added. Provider setup is pending."
      );
      setEmail("");
      setName("");
      setExpiresAt("");
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function changeRole(userId: string, nextRole: DocumentationRole) {
    setBusy(userId);
    await fetch(`/api/users/${userId}/role`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: nextRole }),
    });
    await load();
    setBusy(null);
  }

  async function disableUser(userId: string) {
    setBusy(userId);
    await fetch(`/api/users/${userId}/disable`, { method: "PATCH" });
    await load();
    setBusy(null);
  }

  if (state.loading || loading) return <p className="text-sm text-zinc-500">Loading users…</p>;
  if (!canManage) return <p className="text-sm text-red-600">You do not have permission to manage users.</p>;

  return (
    <div data-testid="users-management" className="space-y-8">
      <form onSubmit={addUser} className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        <h2 className="text-sm font-semibold">Add user</h2>
        <p className="mt-1 text-xs text-zinc-500">The account is provisioned directly in Auth0. Password setup remains provider-managed.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-4">
          <label className="text-xs"><span>Email</span><input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} className="mt-1 w-full rounded border px-2 py-1.5 dark:border-zinc-700 dark:bg-zinc-900" /></label>
          <label className="text-xs"><span>Display name</span><input value={name} onChange={(event) => setName(event.target.value)} className="mt-1 w-full rounded border px-2 py-1.5 dark:border-zinc-700 dark:bg-zinc-900" /></label>
          <label className="text-xs"><span>Role</span><select value={role} onChange={(event) => setRole(event.target.value as DocumentationRole)} className="mt-1 w-full rounded border px-2 py-1.5 dark:border-zinc-700 dark:bg-zinc-900">{DOCUMENTATION_ROLES.filter((value) => state.user?.role === "owner" || value !== "owner").map((value) => <option key={value}>{value}</option>)}</select></label>
          <label className="text-xs"><span>Access expiry</span><input type="date" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} className="mt-1 w-full rounded border px-2 py-1.5 dark:border-zinc-700 dark:bg-zinc-900" /></label>
        </div>
        <button disabled={busy === "add"} className="mt-3 rounded bg-sky-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">{busy === "add" ? "Adding…" : "Add user"}</button>
        {status ? <p className="mt-3 text-xs text-emerald-700" role="status">{status}</p> : null}
        {error ? <p className="mt-3 text-xs text-red-600">{error}</p> : null}
      </form>
      <section>
        <h2 className="text-sm font-semibold">Documentation users</h2>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-zinc-500"><th className="py-2">User</th><th>Role</th><th>Status</th><th>Last login</th><th>Actions</th></tr></thead>
            <tbody>{users.map((user) => (
              <tr key={user.id}>
                <td className="border-t py-2 dark:border-zinc-800">{user.name || user.email}<span className="block text-xs text-zinc-500">{user.email}</span></td>
                <td className="border-t dark:border-zinc-800">{user.id !== state.user?.id ? <select value={user.role} disabled={busy === user.id} onChange={(event) => void changeRole(user.id, event.target.value as DocumentationRole)}>{DOCUMENTATION_ROLES.map((value) => <option key={value}>{value}</option>)}</select> : user.role}</td>
                <td className="border-t dark:border-zinc-800">{user.status}</td>
                <td className="border-t text-xs dark:border-zinc-800">{user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : "Never"}</td>
                <td className="border-t dark:border-zinc-800">{user.id !== state.user?.id && user.status === "active" ? <button onClick={() => void disableUser(user.id)} className="text-xs text-red-600 underline">Disable</button> : null}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

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

interface InviteRow {
  id: string;
  email: string;
  role: DocumentationRole;
  status: string;
  expiresAt: string;
}

function InviteLinkCopy({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <div
      className="mt-3 flex flex-col gap-2 rounded bg-zinc-100 p-2 text-xs dark:bg-zinc-800 sm:flex-row sm:items-center sm:justify-between"
      data-testid="invite-url"
    >
      <div className="min-w-0 flex-1">
        <span className="text-zinc-500">Invite link: </span>
        <code className="break-all">{url}</code>
      </div>
      <button
        type="button"
        onClick={() => void copyLink()}
        data-testid="invite-url-copy"
        className="shrink-0 self-start rounded border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-950 sm:self-center"
      >
        {copied ? "Copied" : "Copy link"}
      </button>
    </div>
  );
}

export function UsersManagementPanel() {
  const { state, hasPermission } = useDocumentationAuth();
  const canManage = hasPermission("manage_users");
  const [users, setUsers] = useState<UserRow[]>([]);
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<DocumentationRole>("viewer");
  const [inviteExpiryDays, setInviteExpiryDays] = useState(7);
  const [lastInviteUrl, setLastInviteUrl] = useState<string | null>(null);
  const [lastInviteStatus, setLastInviteStatus] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/users");
      if (res.status === 403) {
        setError("You do not have permission to manage users.");
        return;
      }
      if (!res.ok) {
        setError("Could not load users.");
        return;
      }
      const data = (await res.json()) as { users?: UserRow[]; invites?: InviteRow[] };
      setUsers(data.users ?? []);
      setInvites(data.invites ?? []);
    } catch {
      setError("Could not load users.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (state.loading) return;
    if (canManage) void load();
    else {
      setLoading(false);
      setError("You do not have permission to manage users.");
    }
  }, [canManage, load, state.loading]);

  async function createInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!canManage) return;
    setBusy("invite");
    setError(null);
    setLastInviteUrl(null);
    setLastInviteStatus(null);
    try {
      const invited = inviteEmail.trim();
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: invited,
          role: inviteRole,
          expiryDays: inviteExpiryDays,
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        inviteUrl?: string;
      };
      if (!res.ok) {
        setError(data.error ?? "Invite failed");
        return;
      }
      setLastInviteUrl(data.inviteUrl ?? null);
      setLastInviteStatus(
        `Invite created for ${invited}. Copy the link below and share it with them.`
      );
      setInviteEmail("");
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function revokeInvite(id: string) {
    setBusy(id);
    await fetch(`/api/users/invites/${id}/revoke`, { method: "POST" });
    await load();
    setBusy(null);
  }

  async function refreshInviteLink(id: string, email: string) {
    setBusy(id);
    const res = await fetch(`/api/users/invites/${id}/resend`, { method: "POST" });
    const data = (await res.json()) as { inviteUrl?: string; error?: string };
    if (!res.ok) {
      setError(data.error ?? "Could not create a new invite link.");
    } else if (data.inviteUrl) {
      setLastInviteUrl(data.inviteUrl);
      setLastInviteStatus(
        `New link for ${email}. Copy below and share it — the previous link no longer works.`
      );
    }
    await load();
    setBusy(null);
  }

  async function changeRole(userId: string, role: DocumentationRole) {
    setBusy(userId);
    await fetch(`/api/users/${userId}/role`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
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

  if (state.loading || loading) {
    return <p className="text-sm text-zinc-500">Loading users…</p>;
  }

  if (error) {
    return (
      <p className="text-sm text-red-600 dark:text-red-400" data-testid="users-error">
        {error}
      </p>
    );
  }

  return (
    <div data-testid="users-management" className="space-y-8">
      {canManage ? (
        <form onSubmit={createInvite} className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <h2 className="text-sm font-semibold">Invite user</h2>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Create an invite link and share it with your teammate (Slack, email, etc.).
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <label className="block text-xs">
              <span className="text-zinc-500">Email</span>
              <input
                type="email"
                required
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="mt-1 w-full rounded border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                data-testid="invite-email"
              />
            </label>
            <label className="block text-xs">
              <span className="text-zinc-500">Role</span>
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as DocumentationRole)}
                className="mt-1 w-full rounded border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                data-testid="invite-role"
              >
                {DOCUMENTATION_ROLES.filter((r) => r !== "owner").map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs">
              <span className="text-zinc-500">Expiration (days)</span>
              <input
                type="number"
                min={1}
                max={90}
                value={inviteExpiryDays}
                onChange={(e) => setInviteExpiryDays(Number(e.target.value))}
                className="mt-1 w-full rounded border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                data-testid="invite-expiry"
              />
            </label>
          </div>
          <button
            type="submit"
            disabled={busy === "invite"}
            data-testid="invite-submit"
            className="mt-3 rounded bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50"
          >
            {busy === "invite" ? "Creating…" : "Create invite link"}
          </button>
          {lastInviteStatus ? (
            <p
              className="mt-3 text-xs text-zinc-600 dark:text-zinc-400"
              data-testid="invite-status"
            >
              {lastInviteStatus}
            </p>
          ) : null}
          {lastInviteUrl ? <InviteLinkCopy url={lastInviteUrl} /> : null}
        </form>
      ) : null}

      <section>
        <h2 className="text-sm font-semibold">Pending invites</h2>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-zinc-500">
                <th className="py-2 pr-4">Email</th>
                <th className="py-2 pr-4">Role</th>
                <th className="py-2 pr-4">Expires</th>
                <th className="py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {invites
                .filter((i) => i.status === "pending")
                .map((invite) => (
                  <tr key={invite.id} data-testid={`invite-row-${invite.id}`}>
                    <td className="border-t border-zinc-200 py-2 pr-4 dark:border-zinc-800">
                      {invite.email}
                    </td>
                    <td className="border-t border-zinc-200 py-2 pr-4 dark:border-zinc-800">
                      {invite.role}
                    </td>
                    <td className="border-t border-zinc-200 py-2 pr-4 dark:border-zinc-800">
                      {new Date(invite.expiresAt).toLocaleDateString()}
                    </td>
                    <td className="border-t border-zinc-200 py-2 dark:border-zinc-800">
                      {canManage ? (
                        <div className="flex gap-2">
                          <button
                            type="button"
                            disabled={busy === invite.id}
                            onClick={() => void refreshInviteLink(invite.id, invite.email)}
                            className="text-xs text-sky-700 underline dark:text-sky-400"
                          >
                            New link
                          </button>
                          <button
                            type="button"
                            disabled={busy === invite.id}
                            onClick={() => void revokeInvite(invite.id)}
                            className="text-xs text-red-600 underline"
                          >
                            Revoke
                          </button>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold">Active users</h2>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-zinc-500">
                <th className="py-2 pr-4">Email</th>
                <th className="py-2 pr-4">Role</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Last login</th>
                <th className="py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} data-testid={`user-row-${user.id}`}>
                  <td className="border-t border-zinc-200 py-2 pr-4 dark:border-zinc-800">
                    {user.email}
                    {user.id === state.user?.id ? " (you)" : ""}
                  </td>
                  <td className="border-t border-zinc-200 py-2 pr-4 dark:border-zinc-800">
                    {canManage && user.id !== state.user?.id ? (
                      <select
                        value={user.role}
                        disabled={busy === user.id}
                        onChange={(e) =>
                          void changeRole(user.id, e.target.value as DocumentationRole)
                        }
                      >
                        {DOCUMENTATION_ROLES.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                    ) : (
                      user.role
                    )}
                  </td>
                  <td className="border-t border-zinc-200 py-2 pr-4 dark:border-zinc-800">
                    {user.status}
                  </td>
                  <td className="border-t border-zinc-200 py-2 pr-4 dark:border-zinc-800">
                    {user.lastLoginAt
                      ? new Date(user.lastLoginAt).toLocaleString()
                      : "—"}
                  </td>
                  <td className="border-t border-zinc-200 py-2 dark:border-zinc-800">
                    {canManage && user.id !== state.user?.id && user.status === "active" ? (
                      <button
                        type="button"
                        disabled={busy === user.id}
                        onClick={() => void disableUser(user.id)}
                        className="text-xs text-red-600 underline"
                      >
                        Disable
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

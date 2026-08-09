"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useDocumentationAuth } from "@/components/auth/DocumentationAuthProvider";
import type { DocumentationRole } from "@/lib/documentation-auth/types";
import { DOCUMENTATION_ROLES } from "@/lib/documentation-auth/types";
import {
  authenticatedFetch,
  SESSION_RECOVERY_FAILED_MESSAGE,
  SESSION_RECOVERY_IN_PROGRESS_MESSAGE,
  type SessionRecoveryState,
} from "@/lib/authenticated-fetch";
import {
  USERS_UNAVAILABLE_LOCAL_MESSAGE,
  USERS_UNAVAILABLE_MESSAGE,
} from "@/lib/user-facing-errors";
import {
  SignalBadge,
  SignalButton,
  SignalEmptyState,
  SignalInput,
  SignalPermissionState,
  SignalSectionHeader,
  SignalSelect,
  SignalSkeleton,
  SignalStatus,
} from "@/components/fabric";

interface UserRow {
  id: string;
  email: string;
  name?: string | null;
  role: DocumentationRole;
  status: string;
  lastLoginAt?: string | null;
}

type UsersGetPayload = {
  users?: UserRow[];
  csrfToken?: string;
  error?: string;
  code?: string;
};

type UsersMutationPayload = {
  error?: string;
  hint?: string;
  setupStatus?: string;
  message?: string;
  code?: string;
};

export function UsersManagementPanel() {
  const { state, hasPermission } = useDocumentationAuth();
  const canManage = hasPermission("manage_users");
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<DocumentationRole>("viewer");
  const [expiresAt, setExpiresAt] = useState("");
  const [status, setStatus] = useState("");
  const [recoveryState, setRecoveryState] =
    useState<SessionRecoveryState>("idle");
  const csrfRef = useRef<string | null>(null);

  const clearCsrf = useCallback(() => {
    csrfRef.current = null;
  }, []);

  const onRecoveryStateChange = useCallback(
    (next: SessionRecoveryState) => {
      setRecoveryState(next);
      if (next === "recovering") {
        clearCsrf();
        setError(null);
      }
    },
    [clearCsrf]
  );

  const fetchUsersList = useCallback(async (): Promise<UsersGetPayload> => {
    const response = await authenticatedFetch("/api/users", {
      method: "GET",
      onRecoveryStateChange,
    });
    const data = (await response.json().catch(() => ({}))) as UsersGetPayload;
    if (!response.ok) {
      const err = new Error(data.error ?? "users_load_failed") as Error & {
        status?: number;
        code?: string;
      };
      err.status = response.status;
      err.code = typeof data.code === "string" ? data.code : undefined;
      throw err;
    }
    if (data.csrfToken) csrfRef.current = data.csrfToken;
    return data;
  }, [onRecoveryStateChange]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchUsersList();
      setUsers(data.users ?? []);
    } catch (err) {
      const statusCode =
        err && typeof err === "object" && "status" in err
          ? Number((err as { status?: number }).status)
          : 0;
      const code =
        err && typeof err === "object" && "code" in err
          ? String((err as { code?: string }).code ?? "")
          : "";
      if (statusCode === 401 || code === "SESSION_EXPIRED") {
        setError(SESSION_RECOVERY_FAILED_MESSAGE);
        return;
      }
      if (statusCode === 403) {
        setError("You do not have permission to manage users.");
        return;
      }
      const localPreview = state.authProvider === "disabled";
      setError(localPreview ? USERS_UNAVAILABLE_LOCAL_MESSAGE : USERS_UNAVAILABLE_MESSAGE);
    } finally {
      setLoading(false);
    }
  }, [fetchUsersList, state.authProvider]);

  useEffect(() => {
    queueMicrotask(() => {
      if (!state.loading && canManage) void load();
      else if (!state.loading) setLoading(false);
    });
  }, [canManage, load, state.loading]);

  async function ensureCsrfToken(): Promise<string> {
    if (csrfRef.current) return csrfRef.current;
    const data = await fetchUsersList();
    if (!data.csrfToken) {
      throw new Error("Could not prepare a secure form token. Refresh the page.");
    }
    return data.csrfToken;
  }

  async function addUser(event: React.FormEvent) {
    event.preventDefault();
    setBusy("add");
    setError(null);
    setHint(null);
    setStatus("");
    try {
      const body = JSON.stringify({
        email,
        name,
        role,
        expiresAt: expiresAt || null,
      });
      const response = await authenticatedFetch("/api/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": await ensureCsrfToken(),
        },
        body,
        onRecoveryStateChange,
        prepareRetry: async (init) => {
          clearCsrf();
          const token = await ensureCsrfToken();
          return {
            ...init,
            headers: {
              ...(init.headers as Record<string, string>),
              "Content-Type": "application/json",
              "X-CSRF-Token": token,
            },
            body,
          };
        },
      });
      const data = (await response.json().catch(() => ({}))) as UsersMutationPayload;
      if (!response.ok) {
        if (response.status === 401 || data.code === "SESSION_EXPIRED") {
          setError(SESSION_RECOVERY_FAILED_MESSAGE);
          return;
        }
        if (response.status === 403) {
          setError(data.error ?? "You do not have permission to add users.");
          setHint(data.hint ?? null);
          return;
        }
        setError(data.error ?? "User provisioning failed.");
        setHint(data.hint ?? null);
        return;
      }
      setHint(data.hint ?? null);
      setStatus(
        data.message ||
          (data.setupStatus
            ? `User added (${data.setupStatus}).`
            : "User added successfully.")
      );
      setEmail("");
      setName("");
      setExpiresAt("");
      clearCsrf();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "User provisioning failed.");
    } finally {
      setBusy(null);
    }
  }

  async function changeRole(userId: string, nextRole: DocumentationRole) {
    setBusy(userId);
    setError(null);
    try {
      const body = JSON.stringify({ role: nextRole });
      const response = await authenticatedFetch(`/api/users/${userId}/role`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": await ensureCsrfToken(),
        },
        body,
        onRecoveryStateChange,
        prepareRetry: async (init) => {
          clearCsrf();
          const token = await ensureCsrfToken();
          return {
            ...init,
            headers: {
              ...(init.headers as Record<string, string>),
              "Content-Type": "application/json",
              "X-CSRF-Token": token,
            },
            body,
          };
        },
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as UsersMutationPayload;
        if (response.status === 401 || data.code === "SESSION_EXPIRED") {
          setError(SESSION_RECOVERY_FAILED_MESSAGE);
          return;
        }
        if (response.status === 403) {
          setError(data.error ?? "You do not have permission to update roles.");
          return;
        }
        setError(data.error ?? "Could not update role.");
        return;
      }
      clearCsrf();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update role.");
    } finally {
      setBusy(null);
    }
  }

  async function disableUser(userId: string) {
    setBusy(userId);
    setError(null);
    try {
      const response = await authenticatedFetch(`/api/users/${userId}/disable`, {
        method: "PATCH",
        headers: { "X-CSRF-Token": await ensureCsrfToken() },
        onRecoveryStateChange,
        prepareRetry: async (init) => {
          clearCsrf();
          const token = await ensureCsrfToken();
          return {
            ...init,
            headers: {
              ...(init.headers as Record<string, string>),
              "X-CSRF-Token": token,
            },
          };
        },
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as UsersMutationPayload;
        if (response.status === 401 || data.code === "SESSION_EXPIRED") {
          setError(SESSION_RECOVERY_FAILED_MESSAGE);
          return;
        }
        if (response.status === 403) {
          setError(data.error ?? "You do not have permission to disable users.");
          return;
        }
        setError(data.error ?? "Could not disable user.");
        return;
      }
      clearCsrf();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not disable user.");
    } finally {
      setBusy(null);
    }
  }

  if (state.loading || loading) {
    return (
      <div className="space-y-3" aria-busy="true" aria-label="Loading users">
        <SignalSkeleton className="h-8 w-48" />
        <SignalSkeleton className="h-24 w-full" />
        <SignalSkeleton className="h-40 w-full" />
      </div>
    );
  }
  if (!canManage) {
    return (
      <SignalPermissionState
        title="Users management restricted"
        description="You do not have permission to manage users."
      />
    );
  }

  const recovering = recoveryState === "recovering";
  const recoveryFailed = recoveryState === "failed";

  return (
    <div
      data-testid="users-management"
      className="mx-auto max-w-[var(--workbench-max)] space-y-5"
      data-layout="sf-access-lattice"
    >
      <SignalSectionHeader
        eyebrow="Access lattice"
        title="Okta + documentation membership"
        description="New users receive an Okta setup email. Existing ACTIVE same-tenant users keep password and Okta Verify; no setup email is sent. Target group: Cyware Docs Users."
      />
      <form
        onSubmit={addUser}
        className="rounded-[var(--radius-sm)] border border-[var(--atlas-line)] border-l-2 border-l-[var(--atlas-signal)] bg-[color-mix(in_srgb,var(--atlas-elevated)_90%,transparent)] p-4"
      >
        <p className="atlas-micro-label text-[var(--atlas-signal)]">Provision node</p>
        <h2 className="mt-1 text-sm font-semibold text-[var(--atlas-text)]">Add user</h2>
        <p className="mt-1 text-xs text-[var(--atlas-text-secondary)]">
          Creates the person in Okta, adds them to the docs Okta group, and adds a
          documentation invitation. They select Sign up to set their Okta password,
          then Sign in with email, password, and the code shown in Okta Verify.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SignalInput
            id="users-email"
            label="Email"
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={recovering || busy === "add"}
          />
          <SignalInput
            id="users-name"
            label="Display name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={recovering || busy === "add"}
          />
          <SignalSelect
            id="users-role"
            label="Role"
            value={role}
            onChange={(event) => setRole(event.target.value as DocumentationRole)}
            disabled={recovering || busy === "add"}
          >
            {DOCUMENTATION_ROLES.filter(
              (value) => state.user?.role === "owner" || value !== "owner"
            ).map((value) => (
              <option key={value}>{value}</option>
            ))}
          </SignalSelect>
          <SignalInput
            id="users-expiry"
            label="Access expiry"
            type="date"
            value={expiresAt}
            onChange={(event) => setExpiresAt(event.target.value)}
            disabled={recovering || busy === "add"}
          />
        </div>
        <SignalButton
          type="submit"
          className="mt-4"
          disabled={busy === "add" || recovering}
          loading={busy === "add" || recovering}
        >
          {recovering ? "Refreshing session…" : "Add user"}
        </SignalButton>
        {recovering ? (
          <p className="mt-3 text-xs text-[var(--info)]" role="status">
            {SESSION_RECOVERY_IN_PROGRESS_MESSAGE}
          </p>
        ) : null}
        {recoveryFailed ? (
          <p className="mt-3 text-xs text-[var(--warning)]" role="status">
            {SESSION_RECOVERY_FAILED_MESSAGE}
          </p>
        ) : null}
        {status ? (
          <p className="mt-3 text-xs text-[var(--success)]" role="status">
            {status}
          </p>
        ) : null}
        {error ? <p className="mt-3 text-xs text-[var(--danger)]">{error}</p> : null}
        {hint ? <p className="mt-1 text-xs text-[var(--text-muted)]">{hint}</p> : null}
      </form>
      <section className="rounded-[var(--radius-sm)] border border-[var(--atlas-line)] bg-[color-mix(in_srgb,var(--atlas-elevated)_90%,transparent)] p-3">
        <p className="atlas-micro-label text-[var(--atlas-signal)]">Membership lattice</p>
        <h2 className="mt-1 text-sm font-semibold text-[var(--atlas-text)]">Documentation users</h2>
        {!users.length ? (
          <div className="mt-3">
            <SignalEmptyState
              title="No documentation users yet"
              description="Add a user above to provision Okta access and a documentation invitation."
            />
          </div>
        ) : (
          <div className="sf-table-wrap mt-3 overflow-x-auto rounded-[var(--radius-sm)]">
            <table className="w-full min-w-[640px] text-sm text-[var(--atlas-text)]">
              <thead>
                <tr>
                  <th className="p-2.5 text-left" scope="col">
                    User
                  </th>
                  <th className="p-2.5 text-left" scope="col">
                    Role
                  </th>
                  <th className="p-2.5 text-left" scope="col">
                    Status
                  </th>
                  <th className="p-2.5 text-left" scope="col">
                    Last login
                  </th>
                  <th className="p-2.5 text-left" scope="col">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} className="border-t border-[var(--atlas-line)]">
                    <td className="p-2.5">
                      {user.name || user.email}
                      <span className="block font-mono text-[10px] text-[var(--atlas-text-muted)]">
                        {user.email}
                      </span>
                    </td>
                    <td className="p-2.5">
                      {user.id !== state.user?.id ? (
                        <SignalSelect
                          aria-label={`Role for ${user.email}`}
                          value={user.role}
                          disabled={busy === user.id || recovering}
                          onChange={(event) =>
                            void changeRole(
                              user.id,
                              event.target.value as DocumentationRole
                            )
                          }
                        >
                          {DOCUMENTATION_ROLES.map((value) => (
                            <option key={value}>{value}</option>
                          ))}
                        </SignalSelect>
                      ) : (
                        <SignalBadge>{user.role}</SignalBadge>
                      )}
                    </td>
                    <td className="p-2.5">
                      <SignalStatus
                        label={user.status}
                        tone={user.status === "active" ? "success" : "neutral"}
                      />
                    </td>
                    <td className="p-2.5 text-xs text-[var(--text-secondary)]">
                      {user.lastLoginAt
                        ? new Date(user.lastLoginAt).toLocaleString()
                        : "Never"}
                    </td>
                    <td className="p-2.5">
                      {user.id !== state.user?.id && user.status === "active" ? (
                        <SignalButton
                          type="button"
                          variant="danger"
                          size="sm"
                          disabled={busy === user.id || recovering}
                          loading={busy === user.id}
                          onClick={() => void disableUser(user.id)}
                        >
                          Disable
                        </SignalButton>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

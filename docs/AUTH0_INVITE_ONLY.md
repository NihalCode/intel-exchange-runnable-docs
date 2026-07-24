# Auth0 Invite-Only Setup — Cyware Documentation Workspace

> **Current production model (2026):** Auth0 is a thin OIDC/session broker. Login uses a single Okta Workforce enterprise connection (`AUTH0_OKTA_CONNECTION`). Password and Okta Verify live in Okta. Add user provisions Okta + docs group (`OKTA_DOCS_GROUP_ID`). Google and Auth0 Database login/signup are disabled. See [OKTA_AUTH0_FEDERATION.md](../enterprise/auth/OKTA_AUTH0_FEDERATION.md).

This document describes how to configure Auth0 for **strict invite-only** access to the Cyware Runnable API Docs workspace. Authentication proves identity only; access is granted only when the user email matches an active user or valid pending invite in the application database.

## Overview

Enforcement happens at three layers:

1. **Auth0 Post-Login Action** — calls `POST /api/auth/invite-check` before Auth0 completes login
2. **Application session bootstrap** — `POST /api/auth/session` / `GET /api/auth/me` creates the documentation user on first login
3. **Middleware + API guards** — protected routes require Auth0 session; API routes require invite-validated app session and role permissions

## Environment variables

Add to Vercel (or `.env.local` for development):

```env
AUTH0_SECRET=                            # 32+ random bytes (session cookie encryption)
AUTH0_BASE_URL=https://your-app.example  # Same as APP_BASE_URL
AUTH0_ISSUER_BASE_URL=https://YOUR_TENANT.auth0.com
AUTH0_CLIENT_ID=
AUTH0_CLIENT_SECRET=
AUTH0_ACTION_SHARED_SECRET=              # Strong random secret for Post-Login Action
APP_BASE_URL=https://your-app.example
AUTH0_OKTA_CONNECTION=cyware-docs-okta   # Required — only Okta enterprise connection
OKTA_ORG_URL=https://integrator-XXXX.okta.com
OKTA_API_TOKEN=
OKTA_DOCS_GROUP_ID=00g...                # Cyware Docs Users (preferred under Federation Broker Mode)
# OKTA_APP_ID=0oa...                     # optional; soft-fails under Federation Broker Mode
# AUTH_COOKIE_DOMAIN=.cyninjadev.com
# Cold-start owner bootstrap (only when zero active users). Canonical: INITIAL_OWNER_EMAIL
INITIAL_OWNER_EMAIL=
DATABASE_URL=                            # Required on Vercel (Postgres). SQLite used locally when unset
```

Never commit real credentials. Never log Auth0 tokens or invite tokens.

For **Okta-only** sign-in (recommended): follow **[docs/enterprise/auth/OKTA_AUTH0_FEDERATION.md](../enterprise/auth/OKTA_AUTH0_FEDERATION.md)** — Add user provisions Okta; Sign up sets password; Sign in uses password + Okta Verify. Auth0 MFA stays **Never**.

## Auth0 application settings

1. Create a **Regular Web Application** in Auth0
2. Enable **only** the Okta Workforce enterprise connection; disable Google and Database on the app. Set Auth0 MFA to **Never**.
3. Set **Allowed Callback URLs**:
   - `https://your-app.example/auth/callback`
   - `http://localhost:3000/auth/callback` (development)
4. Set **Allowed Logout URLs** (exact origins — required for MFA step-up and normal logout):
   - `https://apitest1.cyninjadev.com`
   - `https://cyware-docs-ctix.vercel.app`
   - `https://cyware-docs-cftr.vercel.app`
   - `https://cyware-docs-csap.vercel.app`
   - `https://cyware-docs-orchestrate.vercel.app`
   - `http://localhost:3000`
   - Optional wildcards (recommended): `https://*.vercel.app`, `https://apitest1.cyninjadev.com/*`
6. Set **Allowed Web Origins** to your app base URL
7. **MFA (Okta-only):** tenant MFA **Never**; do **not** enable Post-Login `api.multifactor.enable`. Password + Okta Verify happen at Okta.

### MFA step-up (“Sign out and complete MFA”)

Admin MFA uses `/access/mfa-step-up` → Auth0 `/v2/logout?returnTo={APP_ORIGIN}` (origin only, no path) → then `/auth/login?prompt=login&max_age=0&acr_values=…`.

Do **not** put `/auth/login?...` in logout `returnTo` — Auth0 rejects relative or non-allowlisted paths and shows **Oops!, something went wrong**. Each product’s `APP_BASE_URL` / `AUTH0_BASE_URL` must equal that host’s origin above.

## OAuth transaction cookie fix (`invalid_state`)

Browsers often drop the Auth0 transaction cookie (`__txn_*`) on immediate **307 redirects** to Auth0. That causes **"The state parameter is invalid"** on `/auth/callback`.

**Permanent fix:**

1. **`/auth/*` routes** run on a **Node.js route handler** (`src/app/auth/[...slug]/route.ts`), not the edge proxy.
2. **`/auth/login`** returns a **200 HTML bridge page** that sets the transaction cookie before redirecting to Auth0 (instead of a bare 307).
3. If the cookie is still missing on callback, the app **restores it from storage** (`oauth_transactions` table when `DATABASE_URL` is set, or `.data/oauth-transactions.json` locally).

The proxy matcher excludes `/auth` so OAuth never runs on the edge layer. **Allowed Callback URLs** remain `{APP_BASE_URL}/auth/callback` — no Auth0 dashboard change required if already configured.

| Cause | Fix |
|-------|-----|
| `APP_BASE_URL` / `AUTH0_BASE_URL` wrong on Vercel | Set exactly your production URL (no trailing slash). Must match Auth0 Allowed Callback URLs. |
| `AUTH0_SECRET` changed mid-login or too short | Use a stable 32+ character secret. Do not rotate while users are logging in. |
| Login took longer than ~2 hours | Start sign-in again from `/sign-in`. |
| Auth0 callback URL mismatch | Allowed Callback URLs must include `{APP_BASE_URL}/auth/callback` exactly. |

After a failed callback, the app redirects to `/sign-in` with a friendly error message.

## Post-Login Action

Create an Auth0 Action (Login / Post Login) and deploy this logic:

```js
exports.onExecutePostLogin = async (event, api) => {
  const secret = event.secrets.AUTH0_ACTION_SHARED_SECRET;
  const appBase = event.secrets.APP_BASE_URL;

  const res = await fetch(`${appBase}/api/auth/invite-check`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: event.user.email,
      auth0UserId: event.user.user_id,
      connection: event.connection.name,
    }),
  });

  if (!res.ok) {
    api.access.deny("invite_check_failed", "Unable to verify workspace access.");
    return;
  }

  const data = await res.json();
  if (!data.allowed) {
    api.access.deny(
      "invite_required",
      "You must be invited to access this documentation workspace."
    );
  }
};
```

Add Action secrets:

- `AUTH0_ACTION_SHARED_SECRET` — same value as server env
- `APP_BASE_URL` — e.g. `https://your-app.example`

Attach the Action to the Login flow **after** authentication.

## First-login invite acceptance

When an invited user completes Auth0 login:

1. Auth0 establishes identity (email + `sub`)
2. App normalizes email and finds pending invite or active user
3. On first login with valid invite: creates `DocumentationUser`, assigns invite role, marks invite accepted, writes audit log
4. User enters the workspace with assigned role (no self-selection)

## Bootstrap owner (cold start)

When **`INITIAL_OWNER_EMAIL`** is set (aliases: `DOCUMENTATION_BOOTSTRAP_OWNER_EMAIL`, `INITIAL_ADMIN_EMAIL`), that email may sign in as `owner` **only while the database has zero active users**. After the first active user exists, bootstrap no longer applies — use invites or ensure the owner has an active user row.

Active users (including `role=owner`, `status=active`) are always allowed without a pending invite.

See [PRODUCTION_AUTH_DEBUG.md](./PRODUCTION_AUTH_DEBUG.md) for troubleshooting.

## Invite links

Admins create invites in **Settings → Users**. The app returns a one-time link:

```text
https://your-app.example/invite?token=RAW_TOKEN
```

Only the SHA-256 hash of the token is stored. Raw tokens are never logged.

### Invite email (optional)

When `RESEND_API_KEY` and `INVITE_EMAIL_FROM` are set in Vercel, **Send invite** and **Resend** email the link automatically via [Resend](https://resend.com).

1. Create a Resend account and verify your sending domain
2. Add env vars:
   ```env
   RESEND_API_KEY=re_...
   INVITE_EMAIL_FROM=Cyware API Docs <invites@yourdomain.com>
   INVITE_EMAIL_WORKSPACE_NAME=Cyware API Docs
   ```
3. Redeploy

If email is not configured, admins still get a copyable invite link in the UI.

## Testing

### Uninvited login

1. Use an account that has **no** invite in the database
2. Click **Sign in** on `/sign-in` (routes through Okta via Auth0)
3. Auth0 Action should deny with `invite_required`, or app redirects to `/access/invite-required`

### Invited Okta login

1. Admin uses **Add user** for `user@company.com` with role `viewer` (creates Okta user + group + local invite)
2. User completes Okta first-time password setup (Sign up), then **Sign in** with email, Okta password, and Okta Verify
3. User should land in docs with `viewer` role

### Wrong email / identity conflict

1. Invite `user@company.com` and complete Add user (provisional `auth0|invited|…` row until first login)
2. Sign in through Okta with the **same** email → app links the live Auth0 broker `sub`
3. `/access/wrong-email` is reserved for rare cases where that email cannot be linked (e.g. Auth0 `sub` already owned by another workspace user)
4. Signing in with a **different** email than any invite → usually `/access/invite-required`

## Roles

| Role | Capabilities |
|------|----------------|
| owner | All permissions |
| admin | Users, sources, integrations, docs, agent, sync, audit |
| documentation_manager | Docs, agent, sync, sources |
| developer | Docs, agent, API details, snippet testing, diagnostics |
| viewer | Read docs, ask agent |

Only **owner** and **admin** can manage invites and users.

## Security notes

- Enable only the Okta enterprise connection on the Auth0 application; do not re-enable Google or Database login
- Always enforce invite check in Post-Login Action **and** application session
- Disabled users are blocked on every API call
- Revoked/expired invites cannot be reused
- Audit logs record invite/auth events without secrets

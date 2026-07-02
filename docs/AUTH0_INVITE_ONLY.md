# Auth0 Invite-Only Setup — Cyware Documentation Workspace

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
DOCUMENTATION_BOOTSTRAP_OWNER_EMAIL=       # Optional cold-start owner (only when DB has zero users)
DATABASE_URL=                            # Optional Postgres; SQLite used locally when unset
AUTH0_GOOGLE_CONNECTION=google-oauth2    # Optional — connection name for Google button
AUTH0_EMAIL_CONNECTION=                  # Optional — connection name for company email button
```

Never commit real credentials. Never log Auth0 tokens or invite tokens.

## Auth0 application settings

1. Create a **Regular Web Application** in Auth0
2. **Disable public signup** on database connections (Settings → Authentication → Database → Disable Sign Ups)
3. Enable **Google** and your **company email** connection (database, passwordless, or enterprise SSO)
4. Set **Allowed Callback URLs**:
   - `https://your-app.example/auth/callback`
   - `http://localhost:3000/auth/callback` (development)
5. Set **Allowed Logout URLs**:
   - `https://your-app.example`
   - `http://localhost:3000`
6. Set **Allowed Web Origins** to your app base URL

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

If the database has **zero users** and `DOCUMENTATION_BOOTSTRAP_OWNER_EMAIL` is set, the first Auth0 login with that exact email becomes `owner` without a pre-existing invite record. Use only for initial deployment.

## Invite links

Admins create invites in **Settings → Users**. The app returns a one-time link:

```text
https://your-app.example/invite?token=RAW_TOKEN
```

Only the SHA-256 hash of the token is stored. Raw tokens are never logged.

## Testing

### Uninvited Google login

1. Use a Google account that has **no** invite in the database
2. Click **Continue with Google** on `/auth/login`
3. Auth0 Action should deny with `invite_required`, or app redirects to `/access/invite-required`

### Invited company email login

1. Admin invites `user@company.com` with role `viewer`
2. User opens invite link, then signs in via **Continue with company email**
3. User should land in docs with `viewer` role

### Wrong email

1. Invite `user@company.com`
2. Sign in with a different email
3. App blocks with `/access/wrong-email`

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

- Do not rely on Auth0 “disable signup” alone — social logins can still create Auth0 profiles
- Always enforce invite check in Post-Login Action **and** application session
- Disabled users are blocked on every API call
- Revoked/expired invites cannot be reused
- Audit logs record invite/auth events without secrets

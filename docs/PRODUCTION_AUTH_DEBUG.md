# Production Auth Debug Checklist

Use this checklist when a workspace owner or admin sees **"This documentation workspace is invite-only"** on sign-in.

## 1. Run safe diagnostics

```bash
npm run auth:diagnose
```

In production (as owner/admin after first successful login), call:

```http
GET /api/admin/auth-diagnostics
```

Returns configuration status without secrets.

## 2. Verify environment variables (Vercel → Settings → Environment Variables)

| Variable | Required | Notes |
|----------|----------|-------|
| `AUTH0_SECRET` | Yes | 32+ characters; stable across deploys |
| `AUTH0_ISSUER_BASE_URL` | Yes | `https://YOUR_TENANT.auth0.com` |
| `AUTH0_CLIENT_ID` / `AUTH0_CLIENT_SECRET` | Yes | Regular Web Application |
| `APP_BASE_URL` | Yes | Exact production URL, no trailing slash |
| `AUTH0_ACTION_SHARED_SECRET` | Yes | Must match Auth0 Post-Login Action secret |
| `DATABASE_URL` | Yes (Vercel) | Postgres; without it, user data is ephemeral |
| `INITIAL_OWNER_EMAIL` | Cold start | Canonical; aliases below |

**Initial owner email aliases** (first match wins):

1. `INITIAL_OWNER_EMAIL` (canonical)
2. `DOCUMENTATION_BOOTSTRAP_OWNER_EMAIL` (legacy)
3. `INITIAL_ADMIN_EMAIL` (legacy)

Bootstrap runs **only when zero active users** exist in the database.

## 3. Common root causes

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Invite-only for owner who signed in before | `DATABASE_URL` unset on Vercel — SQLite in `/tmp` wiped on cold start | Add Postgres `DATABASE_URL`; owner must sign in again or be re-invited |
| Invite-only for configured owner, empty DB | Wrong env var name (`INITIAL_ADMIN_EMAIL` set but code read old name only) | Set `INITIAL_OWNER_EMAIL` or any alias; redeploy |
| "Sign-in could not verify workspace access" | `AUTH0_ACTION_SHARED_SECRET` or `APP_BASE_URL` mismatch in Auth0 Action | Align Action secrets with Vercel env |
| Invite-only after revoke/expired invite | Stale invite row; fixed in app — active users bypass invites | Ensure owner has `status=active` user row in Postgres |
| Disabled message | User row `status=disabled` | Re-enable in Settings → Users |
| Wrong email page | Google account email ≠ invited email | Sign in with invited address |

## 4. Owner sign-in decision tree

```
Auth0 login succeeds
  └─ Post-Login Action → POST /api/auth/invite-check
       ├─ Active user (status=active|pending) → allowed
       ├─ Valid pending invite → allowed
       ├─ INITIAL_OWNER_EMAIL + activeUserCount=0 → bootstrap allowed
       ├─ Disabled user → blocked (disabled)
       ├─ Revoked/expired invite, no active user → blocked
       └─ Uninvited → blocked (invite_required)
  └─ App session (/post-login)
       ├─ Existing auth0_user_id → login
       ├─ First login + allowed → create user row
       └─ Denied → /access/* page with specific reason
```

## 5. Auth0 Action verification

In Auth0 Dashboard → Actions → your Post-Login Action → Secrets:

- `AUTH0_ACTION_SHARED_SECRET` = same as Vercel
- `APP_BASE_URL` = same as Vercel (no trailing slash)

Test the Action with a known owner email; expect `{ "allowed": true }` from invite-check.

## 6. Post-fix verification

- [ ] `npm run auth:diagnose` exits 0 locally with production-like env
- [ ] Owner with active DB row signs in without invite
- [ ] Cold start: zero users + `INITIAL_OWNER_EMAIL` creates owner on first login
- [ ] `/sign-in` shows `auth_config` (not invite-only) when Action secret missing
- [ ] `/api/admin/auth-diagnostics` returns 401 without session

## E2E gap

Playwright covers login UX smoke tests (`e2e/auth.spec.ts`) but does not run full Auth0 OAuth in CI. Manual verification with real Auth0 tenant is required after deploy.

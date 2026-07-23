# Okta → Auth0 Federation Runbook

**Status:** Option F selected — Auth0 stays as broker; Okta is an Enterprise Connection.  
**Cloudflare Access:** Not used (guide Appendix B optional; deferred).  
**Canary:** CTIX (`https://apitest1.cyninjadev.com`) first.

Related: [SSO_INTEGRATION_REPLACEMENT_PLAN.md](./SSO_INTEGRATION_REPLACEMENT_PLAN.md), [AUTH0_INVITE_ONLY.md](../../AUTH0_INVITE_ONLY.md).

---

## Phase 0 — Dashboard setup (manual)

### 1. Okta

1. Create an **OIDC Web Application** (or use Auth0’s Okta Enterprise Connection wizard, which creates the Okta app for you).
2. Note Issuer URL, Client ID, Client Secret (Auth0 will store these on the connection).
3. Assign users/groups who will access the documentation workspace.

### 2. Auth0

1. **Authentication → Enterprise → Create Connection → Okta** (or OpenID Connect).
2. Enter Okta domain / issuer, client id/secret; enable **OIDC**.
3. Enable the connection on the **same Regular Web Application** used by all four product hosts.
4. Copy the Auth0 **connection name** (e.g. `okta` or `Okta-OIDC`) into app env as `AUTH0_OKTA_CONNECTION`.
5. Keep **Post-Login Action** → `POST /api/auth/invite-check` (invite-only gate unchanged).
6. **Allowed Callback URLs** (examples):
   - `https://apitest1.cyninjadev.com/auth/callback`
   - `https://cyware-docs-csap.vercel.app/auth/callback`
   - `https://cyware-docs-cftr.vercel.app/auth/callback`
   - `https://cyware-docs-orchestrate.vercel.app/auth/callback`
   - `http://localhost:3000/auth/callback`
7. **Allowed Logout URLs** — exact origins (see AUTH0_INVITE_ONLY.md); required for MFA step-up.
8. **Allowed Web Origins** — each product origin + localhost.

### 3. App env (Vercel Production + Preview + `.env.local`)

```env
AUTH0_OKTA_CONNECTION=okta          # exact Auth0 connection name
# Dual login (Okta + email/password): leave INVITE_SKIP_IDP_PROVISION unset/false
# so Add user still creates the Auth0 Database user + password ticket.
# INVITE_SKIP_IDP_PROVISION=true    # Okta-only invites (no Auth0 DB user create)
# INVITE_SKIP_IDP_PROVISION=false   # force Management API create (explicit)
# Shared parent cookie (only after CSAP/CFTR/Orchestrate use *.cyninjadev.com):
# CROSS_DOMAIN_SSO_ENABLED=true
# AUTH_COOKIE_DOMAIN=.cyninjadev.com
```

Sync script also copies `AUTH0_OKTA_CONNECTION`, `INVITE_SKIP_IDP_PROVISION`, `AUTH_COOKIE_DOMAIN`.

### 4. Cloudflare Access

Do **not** enable for this rollout.

---

## Phase 1 — Sign-in (CTIX canary)

- Primary CTA: **Continue with Okta** → `/auth/login?connection={AUTH0_OKTA_CONNECTION}`
- Silent redirect (no error) uses the Okta connection when configured.
- Google / company email remain secondary options.
- Smoke: invited Okta user lands in docs; uninvited → `/access/invite-required`.

## Dual login: Okta SSO + Cyware email/password

Both are supported at once:

| Path | How |
|------|-----|
| **Continue with Okta** | `AUTH0_OKTA_CONNECTION` set; Okta enterprise connection enabled on the Auth0 app |
| **Continue with company email** | Auth0 **Database** connection; **Add user** runs Management API (password setup email) |

Do **not** set `INVITE_SKIP_IDP_PROVISION=true` if you need email/password. That flag is only for Okta-only invites (no Auth0 DB user create).

Database connection: use **Email Verification Link**, leave **Verify email on sign up** off (avoid OTP verification method if it blocks login). Enable the database connection on the same Auth0 Application as Okta.

### Email matching (required)

Invite-only access matches on **normalized email** (trim + lowercase). These must be the same string:

1. **Docs admin → Add user / invite** email  
2. **Okta People → primary email** for that user  
3. Email claim Auth0 receives from the Okta Enterprise connection (`email` on the ID token)

If Add user created an Auth0 **Database** user first, then the person signs in with Okta, the app **relinks** the workspace row to the Okta `sub` (same email). You should **not** see `/access/wrong-email` for that case anymore.

`/access/wrong-email` (“Wrong email for this invite”) still appears only when the same email cannot be linked (rare identity conflict). Signing in with a **different** email than the invite usually lands on `/access/invite-required` instead.

### MFA: desired flow = Okta Verify only → in

App login for Okta is only `/auth/login?connection={AUTH0_OKTA_CONNECTION}` — it does **not** request Auth0 MFA ACR on normal product sign-in. Extra password or authenticator QR after Okta Verify is almost always **Dashboard policy**, not app code.

#### A) Extra password after Okta Verify → Okta policy

1. Okta Admin → **Security → Authentication Policies** (or the policy assigned to the Auth0 OIDC app).  
2. Ensure the app does **not** require password **and** Okta Verify as two separate steps when the user already completed Okta Verify.  
3. Prefer a single factor for the Auth0 app (e.g. Okta Verify only), or “any 1 factor”, for the integrator/test org.

#### B) Authenticator QR (Guardian / Duo-style enroll) after Okta → Auth0 MFA

That enrollment screen is **Auth0 Guardian** (tenant MFA), not Okta:

1. Auth0 Dashboard → **Security → Multi-factor Auth**.  
2. Set MFA to **Never** for this tenant, **or** use **Adaptive MFA** / rules so users authenticating via the **Okta enterprise connection** are not challenged.  
3. **Authentication → Enterprise → [Okta connection] → Settings**: do not enable “also require Auth0 MFA” style options if present.  
4. Confirm no Post-Login Action calls `api.multifactor.enable(...)`.  
5. In **User Management → Users**, open the affected user → **Multifactor** and remove forced Guardian enrollment if they were enrolled during testing.

When Okta already performed MFA, Auth0 should trust the IdP session and **not** enroll a second authenticator.

#### C) Admin MFA step-up (separate)

`ADMIN_REQUIRE_MFA=true` only affects `/admin` after login (app checks `amr`/`acr`). It does not add QR enrollment on the initial Okta CTA. Leave it unset/false until Okta MFA claims flow into the Auth0 ID token.


## Phase 3 — Shared cookie domain

`vercel.app` hosts **cannot** share cookies with `apitest1.cyninjadev.com`.

1. Add custom domains under the same parent (e.g. `csap.` / `cftr.` / `orch.` + `cyninjadev.com`).
2. Allowlist those URLs in Auth0.
3. Set `CROSS_DOMAIN_SSO_ENABLED=true` and `AUTH_COOKIE_DOMAIN=.cyninjadev.com` on each host under that parent.
4. Until then, keep Auth0 silent SSO bounce across hosts.

### MFA claims through Okta federation

When `ADMIN_REQUIRE_MFA=true`, Auth0 session must include `amr`/`acr` (copied in `src/lib/auth0.ts` `beforeSessionSaved`). Confirm Okta authentication policies and Auth0 connection settings pass MFA claims into the ID token. If admin MFA loops after Okta login, require MFA in the Okta app policy and re-test **Sign out and complete MFA**.

## Rollback

1. Disable Okta connection in Auth0 (or remove from Application).
2. Clear `AUTH0_OKTA_CONNECTION` or leave Google/email as primary.
3. Set `INVITE_SKIP_IDP_PROVISION=false` if Management provision is required again.
4. Clear `CROSS_DOMAIN_SSO_ENABLED` / `AUTH_COOKIE_DOMAIN` if cookie Domain misbehaves.

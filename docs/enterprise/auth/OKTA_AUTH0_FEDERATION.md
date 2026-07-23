# Okta → Auth0 Federation Runbook

**Status:** Option F selected — Auth0 stays as broker; Okta is an Enterprise Connection.  
**Cloudflare Access:** Not used (guide Appendix B optional; deferred).  
**Canary:** CTIX (`https://apitest1.cyninjadev.com`) first.  
**Auth0 tenant (example):** `dev-jthpufxs5d58hkiu` (apitest1).

Related: [SSO_INTEGRATION_REPLACEMENT_PLAN.md](./SSO_INTEGRATION_REPLACEMENT_PLAN.md), [AUTH0_INVITE_ONLY.md](../../AUTH0_INVITE_ONLY.md).

---

## Target UX (three paths)

| Path | User sees | Factors | Auth0 MFA after? |
|------|-----------|---------|------------------|
| **1. Continue with Okta** (`AUTH0_OKTA_CONNECTION`, UL may label it `Cyware-Docs-Auth0`) | Okta: **Okta Verify OR password** (pick **one**) → docs | Okta only (1 factor) | **No** |
| **2. Continue with Google** | Google account picker → **Auth0 OTP** (Guardian / Duo / any TOTP app) → docs | Google + Auth0 MFA | **Yes** |
| **3. Continue with company email** (Database / invite) | First time: password ticket → set password. Later: email + password → **Auth0 OTP** (TOTP; can use Okta Verify *as authenticator app*) → docs | Password + Auth0 MFA | **Yes** |

App code never requests `acr_values` / MFA on normal product login. Extra Auth0 OTP after Okta is almost always **tenant MFA = Always** (or an Action that enables MFA for every connection).

### Honest limits (path 3 “Okta Verify”)

- **True Okta Verify push / Okta IdP MFA** only happens on path **1** (Okta enterprise connection). Auth0 cannot attach Okta’s IdP MFA to a Database password login.
- For path **3**, “Okta Verify” means the user enrolls **Auth0 Guardian / OTP** and stores the TOTP secret in the **Okta Verify** app (or Duo / Google Authenticator). Same UX as any authenticator app — **not** Okta policy push.
- Prefer path **1** for employees who must use corporate Okta Verify push.

---

## Phase 0 — Dashboard setup (manual)

### 1. Okta

1. Create an **OIDC Web Application** (or use Auth0’s Okta Enterprise Connection wizard, which creates the Okta app for you).
2. Note Issuer URL, Client ID, Client Secret (Auth0 will store these on the connection).
3. Assign users/groups who will access the documentation workspace.
4. **Authentication policy for the Auth0 OIDC app (required for path 1):**
   - Okta Admin → **Security → Authentication Policies** (or the policy assigned to this app).
   - For the **Cyware Docs / Auth0** app: require **any 1 factor** (Okta Verify **or** password), **not** “Any two factors”.
   - If the org default is 2FA, create a dedicated policy rule for this app only so Docs does not double-prompt inside Okta and then again in Auth0.

### 2. Auth0 — connections

1. **Authentication → Enterprise → Create Connection → Okta** (or OpenID Connect).
2. Enter Okta domain / issuer, client id/secret; enable **OIDC**.
3. Enable the connection on the **same Regular Web Application** used by all four product hosts.
4. Copy the Auth0 **connection name** (e.g. `okta`, `Okta-OIDC`, or display name `Cyware-Docs-Auth0`) into app env as `AUTH0_OKTA_CONNECTION` — must match the **connection name** string (not only the display label).
5. Enable **Google** (`google-oauth2`) and the **Database** connection (`Username-Password-Authentication` or your custom name) on the same Application.
6. Database: **Authentication → Database → [connection] → Settings → Disable Sign Ups** (invite-only). First password comes from Management API **password change ticket** (Add user in docs admin), not public Sign up.
7. Keep **Post-Login Action** → `POST /api/auth/invite-check` (invite-only gate unchanged).
8. **Allowed Callback URLs** (examples):
   - `https://apitest1.cyninjadev.com/auth/callback`
   - `https://cyware-docs-csap.vercel.app/auth/callback`
   - `https://cyware-docs-cftr.vercel.app/auth/callback`
   - `https://cyware-docs-orchestrate.vercel.app/auth/callback`
   - `http://localhost:3000/auth/callback`
9. **Allowed Logout URLs** — exact origins (see AUTH0_INVITE_ONLY.md); required for MFA step-up.
10. **Allowed Web Origins** — each product origin + localhost.

### 3. Auth0 — MFA (required for paths 1–3)

**Goal:** Auth0 challenges MFA for Google + Database only; **never** for the Okta enterprise connection.

#### Recommended (precise)

1. Auth0 Dashboard → **Security → Multi-factor Auth**.
2. Set the tenant MFA policy to **Never** (do **not** leave **Always** on — that is why Okta users hit `mfa-otp-challenge` today).
3. Enable one OTP factor users can complete (e.g. **One-time Password** / Guardian). Duo is fine if already configured; any TOTP app works for enrollment.
4. Create a **Login / Post-Login** Action (separate from or chained after invite-check) and deploy:

```js
/**
 * Enable Auth0 MFA only for Google + Database.
 * Skip MFA when the user authenticated via the Okta enterprise connection
 * (Okta already offered Verify or password).
 *
 * Set secret OKTA_CONNECTION_NAME to the exact Auth0 connection name
 * (same as AUTH0_OKTA_CONNECTION in Vercel), e.g. "okta" or "Cyware-Docs-Auth0".
 */
exports.onExecutePostLogin = async (event, api) => {
  const oktaName = (event.secrets.OKTA_CONNECTION_NAME || "").trim();
  const conn = event.connection?.name || "";
  const strategy = event.connection?.strategy || "";

  // Prefer exact connection name (same as AUTH0_OKTA_CONNECTION).
  // strategy === "okta" covers Auth0's Okta enterprise type; do NOT blanket-skip
  // all "oidc" strategies if you have other OIDC enterprise connections.
  const isOkta =
    (oktaName && conn === oktaName) || strategy === "okta";

  if (isOkta) {
    return; // trust Okta factors; do not call api.multifactor.enable
  }

  const needsAuth0Mfa =
    conn === "google-oauth2" ||
    strategy === "google-oauth2" ||
    strategy === "auth0" || // Username-Password-Authentication
    conn === "Username-Password-Authentication";

  if (needsAuth0Mfa) {
    api.multifactor.enable("any", { allowRememberBrowser: true });
  }
};
```

5. Action secrets: `OKTA_CONNECTION_NAME` = exact value of `AUTH0_OKTA_CONNECTION`.
6. Flow order (Login): **Invite check** → **Conditional MFA** (or MFA then invite — either works; invite deny still blocks access).
7. Confirm **no other** Action/Rule calls `api.multifactor.enable` unconditionally.
8. For users already enrolled during testing: **User Management → Users → [user] → Multifactors** → remove forced enrollment if they should only use Okta next time.
9. Optional: **Authentication → Enterprise → [Okta] → Settings** — do not enable any “require Auth0 MFA” style option if present.

#### Alternative (not preferred)

- Leave MFA **Always** and try connection-level exceptions — Auth0’s product surface varies by plan; the Action above is the reliable per-connection control.
- **Adaptive MFA** alone does not guarantee “skip when Okta already MFA’d.”

### 4. App env (Vercel Production + Preview + `.env.local`)

```env
AUTH0_OKTA_CONNECTION=okta          # exact Auth0 connection name (not display-only)
AUTH0_GOOGLE_CONNECTION=google-oauth2
AUTH0_EMAIL_CONNECTION=Username-Password-Authentication
# or omit AUTH0_EMAIL_CONNECTION and set AUTH0_DATABASE_CONNECTION (sign-in falls back to it)
AUTH0_DATABASE_CONNECTION=Username-Password-Authentication
# Dual login (Okta + email/password): leave INVITE_SKIP_IDP_PROVISION unset/false
# so Add user still creates the Auth0 Database user + password ticket.
# INVITE_SKIP_IDP_PROVISION=true    # Okta-only invites (no Auth0 DB user create)
# Shared parent cookie (only after CSAP/CFTR/Orchestrate use *.cyninjadev.com):
# CROSS_DOMAIN_SSO_ENABLED=true
# AUTH_COOKIE_DOMAIN=.cyninjadev.com
```

Sync script also copies `AUTH0_OKTA_CONNECTION`, `INVITE_SKIP_IDP_PROVISION`, `AUTH_COOKIE_DOMAIN`.

### 5. Cloudflare Access

Do **not** enable for this rollout.

---

## Phase 1 — Sign-in (CTIX canary)

Branded `/sign-in` always shows explicit buttons (no auto-bounce to Auth0):

| Button | Login URL |
|--------|-----------|
| **Continue with Okta** | `/auth/login?connection={AUTH0_OKTA_CONNECTION}` |
| **Continue with Google** | `/auth/login?connection=google-oauth2` (or `AUTH0_GOOGLE_CONNECTION`) |
| **Continue with company email** | `/auth/login?connection={AUTH0_EMAIL_CONNECTION\|\|AUTH0_DATABASE_CONNECTION}` |

- Returning users hitting protected routes still use middleware → `/auth/login` (silent SSO when an Auth0 session cookie exists). Prefer `/sign-in` when the user must **choose** a connection.
- If someone opens Auth0 Universal Login without `connection=`, they may see labels like **Cyware-Docs-Auth0** + Google — avoid that by always using the branded buttons; optionally disable unused connections on the Application.
- Smoke: invited Okta user lands in docs **without** Auth0 OTP; Google invited user gets Auth0 OTP; uninvited → `/access/invite-required`.

## Dual login: Okta SSO + Cyware email/password

Both are supported at once:

| Path | How |
|------|-----|
| **Continue with Okta** | `AUTH0_OKTA_CONNECTION` set; Okta enterprise connection enabled on the Auth0 app |
| **Continue with company email** | Auth0 **Database** connection; **Add user** runs Management API (password setup email) |

Do **not** set `INVITE_SKIP_IDP_PROVISION=true` if you need email/password. That flag is only for Okta-only invites (no Auth0 DB user create).

Database connection: use **Email Verification Link**, leave **Verify email on sign up** off (avoid OTP verification method if it blocks login). Enable the database connection on the same Auth0 Application as Okta. **Disable Sign Ups** so UL does not offer public registration.

### Email matching (required)

Invite-only access matches on **normalized email** (trim + lowercase). These must be the same string:

1. **Docs admin → Add user / invite** email  
2. **Okta People → primary email** for that user  
3. Email claim Auth0 receives from the Okta Enterprise connection (`email` on the ID token)

If Add user created an Auth0 **Database** user first, then the person signs in with Okta, the app **relinks** the workspace row to the Okta `sub` (same email). You should **not** see `/access/wrong-email` for that case anymore.

`/access/wrong-email` (“Wrong email for this invite”) still appears only when the same email cannot be linked (rare identity conflict). Signing in with a **different** email than the invite usually lands on `/access/invite-required` instead.

### MFA checklist (ops)

| Symptom | Fix |
|---------|-----|
| Okta → then Auth0 `mfa-otp-challenge` / Duo | MFA policy **Always**, or Action enabling MFA for Okta — set MFA **Never** + conditional Action (above); Okta app policy = 1 factor |
| Okta asks password **and** Verify | Okta app policy still “any two factors” — set 1-factor for Auth0 app |
| Google skips Auth0 OTP | Conditional MFA Action not attached, or `needsAuth0Mfa` does not match `google-oauth2` |
| DB user never sees OTP | Same; ensure `strategy === "auth0"` branch runs |
| Want Okta Verify push on password login | Not supported — use **Continue with Okta**, or enroll Auth0 TOTP inside Okta Verify app |

#### Admin MFA step-up (separate)

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
5. If MFA Action misbehaves: remove Conditional MFA Action and temporarily set tenant MFA to **Never** (or restore prior policy deliberately).

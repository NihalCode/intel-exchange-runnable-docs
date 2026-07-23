# Clean email / password / Okta Verify login

**Goal:** Auth0 Universal Login shows **only** email, password, and Sign up — no Google, no “Continue with Cyware-Docs-Auth0”, no extra clutter. After password, Auth0 asks for an **Okta Verify** (TOTP) code.

Related app routes always pass `connection={AUTH0_DATABASE_CONNECTION}` so other IdPs cannot appear even if still enabled on the tenant.

---

## Auth0 Dashboard (required)

1. **Applications → [Cyware Docs] → Connections**
   - **Enable** only **Username-Password-Authentication** (or your Database connection).
   - **Disable** Google and the Okta / Cyware-Docs-Auth0 enterprise connection for this application.
2. **Authentication → Database → [connection]**
   - **Enable Sign Ups** (first-time users use Sign up).
   - Optionally disable **Forgot Password** if you do not want “Reset password” on the form.
3. **Security → Multi-factor Auth**
   - Policy: **Always** (or Adaptive with OTP required).
   - Enable **One-time Password** (Guardian / OTP). Users enroll with **Okta Verify**, Duo, or any TOTP app.
4. Keep Post-Login **invite-check** Action (invite-only).
5. Do **not** leave unused social/enterprise connections enabled on this app — that is what produced Google + Cyware-Docs-Auth0 buttons.

---

## App env

```env
AUTH0_DATABASE_CONNECTION=Username-Password-Authentication
# or AUTH0_EMAIL_CONNECTION=Username-Password-Authentication
INVITE_SKIP_IDP_PROVISION=true   # Add user = docs invite; password via Sign up
```

Optional: `OKTA_PROVISION_ON_INVITE=true` plus Okta API vars if you also want Directory users created in Okta (not required for this login UI).

---

## User flow

1. Admin **Add user** (invited email).
2. First time → **Sign up** → email + password on Auth0 → enroll Okta Verify when prompted → docs.
3. Later → **Sign in** → email + password → Okta Verify code → docs.

Branded `/sign-in` only offers **Sign in** and **Sign up** (both open Auth0 Database UL with `connection=` set).

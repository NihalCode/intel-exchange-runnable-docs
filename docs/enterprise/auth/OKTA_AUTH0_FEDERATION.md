# Okta-authoritative login (Auth0 thin broker)

**Goal:** Okta owns identity, password, and Okta Verify. Auth0 is only a session broker via the **Cyware-Docs-Auth0** (or `AUTH0_OKTA_CONNECTION`) Workforce enterprise connection.

```text
Admin Add user
→ Okta user create/link + app assignment + docs invitation
→ Sign up → Okta password-setup email
→ Sign in → Okta email/password → Okta Verify passcode
→ Auth0 callback → docs invite gate → app
```

This is **not** Auth0 Database signup. This is **not** Auth0 Guardian MFA.

---

## Auth0 Dashboard (required)

1. **Applications → [Cyware Docs] → Connections**
   - **Enable only** the Okta enterprise connection (`Cyware-Docs-Auth0` / `AUTH0_OKTA_CONNECTION`).
   - **Disable** Username-Password-Authentication (Database).
   - **Disable** Google and every social connection.
2. **Security → Multi-factor Auth**
   - Policy: **Never** (Okta enforces Verify; do not enable Auth0 MFA / Guardian).
3. Keep Post-Login **invite-check** Action (invite-only).
4. **Allowed Logout URLs**: each product **origin only** (no path/query).

---

## Okta Admin (required)

1. App **Cyware Docs Auth0** (OIDC) assigned to invited users (Add user does this via API).
2. Sign-on / authenticator policy for this app:
   - Password required
   - **Okta Verify passcode** required
   - Do **not** offer Push, FastPass, SMS, email OTP, Duo, WebAuthn, or “choose another method” for this app
3. Users API token + `OKTA_APP_ID` configured in Vercel for provisioning

---

## App env

```env
AUTH0_OKTA_CONNECTION=Cyware-Docs-Auth0
OKTA_ORG_URL=https://integrator-XXXX.okta.com
OKTA_API_TOKEN=...
OKTA_APP_ID=0oa...
# Optional; when Okta API is configured, Add user always provisions Okta:
# OKTA_PROVISION_ON_INVITE=true
```

---

## User flow

1. Admin **Add user** → Okta provision + docs invitation.
2. First time → branded **Sign up** → enter invited email → Okta password email → set password → return to **Sign in** (no auto session).
3. **Sign in** → `/access/fresh-login` (clear sticky broker session) → Auth0 → Okta password → Okta Verify code → invite gate → app.

Branded `/sign-in` shows only **Sign in** and **Sign up** (no Google / connection chooser). Email and password appear on the Okta-hosted login after Sign in.

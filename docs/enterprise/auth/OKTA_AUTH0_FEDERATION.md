# Okta-authoritative login (Auth0 thin broker)

**Goal:** Okta owns identity, password, and Okta Verify. Auth0 is only a session broker via the **Cyware-Docs-Auth0** (or `AUTH0_OKTA_CONNECTION`) Workforce enterprise connection.

```text
Admin Add user
→ Okta user create/link + docs group membership (+ optional app assignment) + docs invitation
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

1. Group **Cyware Docs Users** (or your docs access group). Add user adds people to this group via API (`OKTA_DOCS_GROUP_ID`).
   - With **Federation Broker Mode**, direct user→app assignment is blocked; group membership is the correct path. The Applications column on the group may show **0** apps — that can still be fine if Auth0/Okta federation policies rely on the group.
2. App **Cyware Docs Auth0** (OIDC): prefer group-based access. Optional `OKTA_APP_ID` is still attempted and soft-fails under Federation Broker Mode when the group was assigned.
3. Sign-on / authenticator policy for this app:
   - Password required
   - **Okta Verify passcode** required
   - Do **not** offer Push, FastPass, SMS, email OTP, Duo, WebAuthn, or “choose another method” for this app
4. Users API token + `OKTA_DOCS_GROUP_ID` (and optionally `OKTA_APP_ID`) configured in Vercel for provisioning

---

## App env

```env
AUTH0_OKTA_CONNECTION=cyware-docs-okta
OKTA_ORG_URL=https://integrator-XXXX.okta.com
OKTA_API_TOKEN=...
# Preferred — Directory → Groups → Cyware Docs Users → copy id from URL (/admin/group/<id>)
OKTA_DOCS_GROUP_ID=00g...
# Optional alias / name lookup:
# OKTA_GROUP_ID=00g...
# OKTA_DOCS_GROUP_NAME=Cyware Docs Users
# Optional; soft-fails when Federation Broker Mode blocks direct assignment:
# OKTA_APP_ID=0oa...
# Optional; when Okta API is configured, Add user always provisions Okta:
# OKTA_PROVISION_ON_INVITE=true
```

`AUTH0_OKTA_CONNECTION` is **required** on every product deployment. The Auth0 SDK and every `/auth/login` path pass `connection=<AUTH0_OKTA_CONNECTION>` so Auth0 never shows a connection chooser.

---

## User flow

1. Admin **Add user** → Okta provision + docs invitation.
2. First time → branded **Sign up** → enter invited email → Okta password email → set password → return to **Sign in** (no auto session).
3. **Sign in** → `/access/fresh-login` (clear sticky broker session) → Auth0 → Okta password → Okta Verify code → invite gate → app.

Branded `/sign-in` shows only **Sign in** and **Sign up** (no Google / connection chooser). Email and password appear on the Okta-hosted login after Sign in.

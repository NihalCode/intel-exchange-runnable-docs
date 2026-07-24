# Auth and Identity UX

## Sign-in

- One Sign in action → `freshLoginStartHref` (session clear then Okta)
- One Sign up action → `/sign-up`
- Invite-only + set-password hints preserved
- Database / config warnings preserved
- Visual: atmospheric brand panel clarifies Auth0 brokers session; Okta owns password + Verify

## Sign-up

- Email-only Okta setup request via existing `OktaSignUpForm`
- No local password field
- No automatic session claim
- Floating security form plane matching sign-in

## Access states

`AccessPage` uses `sf-access-plane` / `sf-access-panel` for invite required/expired, wrong email, disabled, MFA step-up, fresh login. Hard `<a>` links retained for post-Auth0 redirects.

## Users / Okta provisioning

Identity command framing explains:

- New user → setup email
- Existing ACTIVE same-tenant → password/Verify preserved, no setup email
- Target group: Cyware Docs Users

Form fields and API mutations unchanged (`email`, `name`, `role`, `expiresAt`).

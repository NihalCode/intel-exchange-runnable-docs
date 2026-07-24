# Contributing

## Source of truth

- Default branch: **`main`**
- Remote: `https://github.com/NihalCode/intel-exchange-runnable-docs`

See [docs/repository/BRANCHING.md](docs/repository/BRANCHING.md) and [docs/repository/REPOSITORY_MAP.md](docs/repository/REPOSITORY_MAP.md).

## Local setup

1. Copy `.env.example` → `.env.local` and set Auth0 broker + Okta provisioning vars as needed.
2. `npm ci`
3. `npm run dev`

Required quality checks before merging:

```bash
npm run typecheck
npm run lint -- --max-warnings=0
npm test
npm run build
```

Auth diagnostics (optional): `npm run auth:diagnose`, `npm run auth:smoke`.

## Branches

Create focused branches from latest `main` using:

```text
feature/…  fix/…  hotfix/…  chore/…  docs/…
```

Open a pull request into `main`. After merge, delete the head branch (local + remote) when it has no unique commits and no open PR.

Do not force-push `main`. Do not delete branches based only on age — follow [docs/repository/BRANCH_CLEANUP_PLAN.md](docs/repository/BRANCH_CLEANUP_PLAN.md).

## Pull requests

- Keep scope tight; avoid unrelated refactors.
- Include a short summary and test plan.
- Do not commit secrets (`.env`, tokens, cookies).
- Prefer preserving Auth0 broker + Okta IdP behavior when touching auth.

## Releases and hotfixes

Ship via `main` and deploy the four Vercel product projects. Hotfixes use `hotfix/<description>` → PR → `main` → deploy.

## Branch deletion

Remote deletions require human approval via `docs/repository/approved-branch-deletions.txt`. Tip SHAs must be recorded first (see cleanup plan/report).

## Repository policy ownership

Update this file when ownership is assigned. Until then, treat `main` maintainers as responsible for merge and branch hygiene.

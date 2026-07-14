# Clean Baseline — Phase 0

Recorded on branch `enterprise/phase-0-intake` after removing `node_modules` / `.next` and running `npm ci` from the lockfile.

## Environment

| Item | Value |
|---|---|
| OS | Windows 10 (build 26200) |
| Node (local) | v24.13.0 |
| npm | 11.6.2 |
| Pinned | `.nvmrc` → **20**; `package.json` engines `>=20 <25` |
| Next.js | 16.2.7 |
| React | 19.2.4 |

**Note:** Local Node is 24; supported/pin is 20 for CI alignment. Phase 1 should verify CI on Node 20.

## Commands and results

| Command | Result | Notes |
|---|---|---|
| `npm ci` | **PASS** | 579 packages; deprecated `prebuild-install` warning |
| `npm run security:scan-secrets` | **PASS** | 1406 tracked files; no sensitive tracked paths |
| `npm run typecheck` | **PASS** | exit 0 |
| `npm run lint` | **FAIL** | **44 problems (18 errors, 26 warnings)** — React `set-state-in-effect`, render-created components, prefer-const, unused vars |
| `npm test` | **PASS** | **73** test files passed |
| `npm run build` | **PASS** | 1531 static pages; Turbopack warning: missing optional `@aws-sdk/client-secrets-manager` |
| `npm audit` | **2 moderate** | transitive `postcss` via `next` (GHSA-qx2v-qp2m-jg93); force-fix would downgrade Next — do not apply blindly |
| `npm run test:e2e` | **NOT RUN** | deferred to Phase 1 (requires Playwright browsers + server) |
| Accessibility scan | **NOT RUN** | Phase 14 |
| Bundle size formal budget | **NOT RUN** | Phase 16/19 |

## Failure categorization

| Finding | Category |
|---|---|
| Lint 18 errors / 26 warnings | **Real code defects** → Phase 1 |
| AWS Secrets Manager module warning | **Missing optional infrastructure** + **fail-open design** → Phase 1 + 3 |
| npm audit moderate (postcss/next) | **Dependency / supply-chain** → Phase 19 (careful upgrade) |
| Docs routes protected | **Real product-policy defect** → Phase 2 |
| Support Agent mocks in nav | **Intentionally unfinished feature shown as prod** → Phase 4/10 |
| Chat in localStorage | **Architecture gap** → Phase 5 |
| `ignoreBuildErrors` in deploy path | **Real security/quality defect** → Phase 12 |
| Vault stub fallback | **Real security defect** → Phase 3 |
| No GitHub Actions | **Missing release engineering** → Phase 19 |
| E2E not recorded here | **Environment / Phase 1** |

## Working-tree artifacts (not committed)

Present locally and correctly gitignored: `.env.local`, `.env.vercel.local`, `.data/`, `.vercel/`, `.cursor/`, `.tmp*`. `npm run archive:check` is expected to **fail** on a developer machine that retains these; use it on export staging directories only.

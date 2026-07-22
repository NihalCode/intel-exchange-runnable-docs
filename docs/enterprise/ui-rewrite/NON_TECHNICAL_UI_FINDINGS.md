# Non-Technical Enterprise UI — Master Test Report

**Session:** 2026-07-21  
**Environment:** Local `http://localhost:3000`, `AUTH_DISABLED=true`, Query Analytics + Unanswered flags enabled  
**Branch:** latest main (uncommitted fixes in working tree)

---

## 1. Personas

| ID | Persona | Goal |
|----|---------|------|
| P1 | Documentation Reader (non-technical) | Find and understand API docs without training |
| P2 | Business Viewer | Read docs + Ask AI; cannot run snippets or change data |
| P3 | Integration Developer | Connect credentials, run snippets, use Ask AI |
| P4 | Workspace Admin | Manage users, content, authentication |
| P5 | Enterprise Admin | Query analytics, unanswered review, deployments |
| P6 | Mobile Field User | Same tasks on phone (~390px) |

---

## 2. Products tested

| Product | Local docs route | Section pages | Endpoint pages | Identity clear |
|---------|------------------|---------------|----------------|----------------|
| CTIX / Intel Exchange | ✅ | ✅ | ✅ | ✅ |
| CSAP | ✅ (after fix) | ✅ | Spot-checked | ✅ |
| Cyware Orchestrate | ✅ | ✅ | Spot-checked | ✅ |
| CFTR | ✅ | ✅ | Spot-checked | ✅ |

Multi-domain production canaries **not run** (no deploy in this session).

---

## 3. Five-second tests (major routes)

| Route | Where am I? | Product clear? | Next action obvious? | Pass |
|-------|-------------|----------------|----------------------|------|
| `/` | ✅ Cyware Technical Documentation | ✅ Four product cards | ✅ Search or pick product | ✅ |
| `/docs/ctix/.../list-threat-data` | ✅ Breadcrumb + title | ✅ CTIX badge | ✅ Enter credentials → Run | ✅ |
| `/agent` | ✅ Documentation Agent | ✅ Connected products listed | ✅ Type question | ✅ |
| `/authentication` | ✅ Product connections | ✅ Per-product form | ✅ Test & connect | ✅ |
| `/settings/users` | ✅ Settings → Users | N/A | ✅ Add user form | ⚠️ user list empty locally |
| `/admin` | ✅ Enterprise Admin Dashboard | N/A | ✅ Sidebar sections | ✅ |
| `/admin/.../query-analytics` | ✅ Query analytics | ✅ Product filter | ✅ Apply filters / export | ✅ |

---

## 4. Findings (NonTechnicalUiFinding model)

### F-001 — BLOCKER (fixed)

```json
{
  "id": "F-001",
  "persona": "Documentation Reader",
  "product": "CSAP",
  "route": "/docs/csap/* (section pages)",
  "viewport": "desktop",
  "category": "task_completion",
  "severity": "blocker",
  "task": "Open CSAP documentation overview",
  "expectedUserUnderstanding": "I am reading CSAP API reference content",
  "observedUserUnderstanding": "The page failed to load — server error",
  "observedBehavior": "500 error overlay; digest 3096719931",
  "evidence": ["Dev server log: extractMarkdownHeadings called from server while marked client-only"],
  "rootCause": "extractMarkdownHeadings lived in DocsChrome.tsx with \"use client\", making it uncallable from ProductDocPage server component",
  "fix": "Moved extractMarkdownHeadings to src/lib/extract-markdown-headings.ts; removed \"use client\" from DocsChrome.tsx",
  "regressionTest": "src/lib/__tests__/extract-markdown-headings.test.ts",
  "finalStatus": "verified"
}
```

### F-002 — HIGH (fixed)

```json
{
  "id": "F-002",
  "persona": "Mobile Field User",
  "product": "CTIX",
  "route": "all docs routes",
  "viewport": "390px",
  "category": "discoverability",
  "severity": "high",
  "task": "Find Ask AI while reading docs on phone",
  "expectedUserUnderstanding": "Ask AI is reachable from navigation",
  "observedUserUnderstanding": "Ask AI link hidden in header (hidden sm:inline); drawer had docs tree only",
  "observedBehavior": "Mobile header shows Admin + Authentication only; no Ask AI",
  "evidence": ["Browser snapshot at 390px on /docs/cftr"],
  "rootCause": "Workspace links use sm:inline visibility; mobile drawer omitted workspace shortcuts",
  "fix": "Added MobileDrawerWorkspaceLinks to documentation navigation drawer",
  "regressionTest": "enterprise-ui-tokens.test.ts asserts mobile-drawer-workspace testid",
  "finalStatus": "verified"
}
```

### F-003 — MEDIUM (open — content)

```json
{
  "id": "F-003",
  "persona": "Documentation Reader",
  "product": "Orchestrate",
  "route": "/docs/orchestrate/cyware-orchestrate-api-reference-theneo",
  "viewport": "desktop",
  "category": "content",
  "severity": "medium",
  "task": "Read Orchestrate overview",
  "expectedUserUnderstanding": "Clean prose introduction",
  "observedUserUnderstanding": "Garbled fragment visible in page (ingested markdown artifact)",
  "observedBehavior": "Stray `\"'}>` text in rendered content",
  "evidence": ["Browser a11y snapshot name field"],
  "rootCause": "Upstream ingested markdown/HTML artifact — not UI chrome",
  "fix": "Re-ingest or clean-local transform for orchestrate pages (out of UI rewrite scope)",
  "regressionTest": "Content QA on ingest",
  "finalStatus": "open"
}
```

### F-004 — MEDIUM (documented limitation)

Legacy CTIX `/docs/[...slug]` routes lack breadcrumbs, TOC, and prev/next — product-prefixed `/docs/[product]/[...slug]` is the primary path.

### F-005 — LOW (documented limitation)

Home DocsSearch returns dropdown results only; no dedicated search results page.

### F-006 — LOW (documented limitation)

Admin sidebar lists Environments / Change Requests / Audit Logs under both Documentation Agent and Shared Configuration — intentional grouping but may confuse new admins.

### F-007 — CRITICAL (fixed)

```json
{
  "id": "F-007",
  "persona": "Business Viewer",
  "product": "All",
  "route": "/agent",
  "severity": "critical",
  "task": "Ask a documentation question",
  "observedBehavior": "Chat showed: Set DEVELOPER_ACCESS_TOKEN in server environment",
  "rootCause": "guardDocumentationApi required developer token for all AUTH_DISABLED API calls",
  "fix": "Local dev (NODE_ENV !== production) uses mock session; user-facing errors sanitized in user-facing-errors.ts",
  "regressionTest": "src/lib/__tests__/guard-api-local.test.ts, user-facing-errors.test.ts",
  "finalStatus": "verified"
}
```

### F-008 — CRITICAL (fixed)

```json
{
  "id": "F-008",
  "persona": "Documentation Reader",
  "route": "/sign-in?error=auth_config",
  "severity": "critical",
  "task": "Understand why sign-in failed",
  "observedBehavior": "AUTH0_ISSUER_BASE_URL and other env var names shown in UI",
  "fix": "Humanized sign-in errors; env checklist hidden from end users (server-side log only)",
  "regressionTest": "user-facing-errors.test.ts",
  "finalStatus": "verified"
}
```

### F-009 — HIGH (fixed)

```json
{
  "id": "F-009",
  "persona": "Documentation Reader",
  "route": "/",
  "severity": "high",
  "task": "Search and open a doc page from home",
  "observedBehavior": "Clicking search result dismissed dropdown without navigation",
  "fix": "DocsSearch uses router.push + mousedown guard; respects ProductContext search scope",
  "regressionTest": "docs-search-navigation.test.ts",
  "finalStatus": "verified"
}
```

### F-010 — HIGH (fixed)

```json
{
  "id": "F-010",
  "persona": "Workspace Admin",
  "route": "/settings",
  "severity": "high",
  "task": "Open Settings from nav",
  "observedBehavior": "404 at /settings while nav linked to /settings/users",
  "fix": "Added /settings redirect to /settings/users",
  "finalStatus": "verified"
}
```

### F-011 — HIGH (fixed)

```json
{
  "id": "F-011",
  "persona": "Workspace Admin",
  "route": "/settings/users",
  "severity": "high",
  "task": "Manage users locally",
  "observedBehavior": "Could not load users + Auth0 provisioning jargon",
  "fix": "Plain-language errors for AUTH_DISABLED; removed Auth0-specific add-user copy",
  "finalStatus": "verified"
}
```

### F-012 — MEDIUM (fixed)

```json
{
  "id": "F-012",
  "persona": "Integration Developer",
  "route": "/agent vs /authentication",
  "severity": "medium",
  "task": "Understand product connection status",
  "observedBehavior": "Ask AI showed all products connected; Auth showed 0 of 4",
  "fix": "docsPreviewMode messaging on /agent; local preview banner on CredentialManager",
  "finalStatus": "verified"
}
```

### F-013 — HIGH (open — not reproduced)

Intermittent `/docs/ctix` and section route 500s reported in walkthrough. Not reproduced after F-001 extractMarkdownHeadings fix; `/docs/ctix` verified in browser this session. Monitor via CI/e2e.

---

## 5. Security / permission clarity (verified unchanged)

- Secret Key: memory-only placeholders on `/authentication` and endpoint runners ✅
- Run button disabled without credentials ✅
- CodeBlock view-only message for roles without `test_snippets` ✅
- Viewer Ask AI gated by `viewer_ask_ai_access_enabled` (server + page) ✅
- Credentials not in AppFrame header ✅
- `npm run security:scan-secrets` ✅

---

## 6. Fixes applied

### Prior session

| File | Change |
|------|--------|
| `src/lib/extract-markdown-headings.ts` | New server-safe TOC helper |
| `src/components/DocsChrome.tsx` | Removed `"use client"`; dropped duplicate helper |
| `src/app/docs/[product]/[...slug]/page.tsx` | Import helper from lib |
| `src/components/AppFrame.tsx` | Mobile drawer workspace links |
| `src/lib/__tests__/extract-markdown-headings.test.ts` | Regression tests |

### Follow-up session (2026-07-21)

| File | Change |
|------|--------|
| `src/lib/user-facing-errors.ts` | Plain-language error sanitization |
| `src/lib/documentation-auth/guard-api.ts` | Local AUTH_DISABLED session without dev token |
| `src/app/sign-in/page.tsx` | Humanized auth config errors |
| `src/components/DocsSearch.tsx` | Search navigation + product scope |
| `src/lib/docs-search-href.ts` | Shared href builder + tests |
| `src/app/settings/page.tsx` | Redirect to `/settings/users` |
| `src/components/auth/UsersManagementPanel.tsx` | Softened local error copy |
| `src/components/AgentChat.tsx` | Local preview product messaging |
| `src/components/authentication/CredentialManager.tsx` | Local preview banner |
| `src/app/changelog/page.tsx` | Empty state CTAs |
| `src/lib/__tests__/user-facing-errors.test.ts` | No env vars in client copy |
| `src/lib/__tests__/guard-api-local.test.ts` | Ask AI local access |
| `src/lib/__tests__/docs-search-navigation.test.ts` | Search href regression |

---

## 7. Quality gate results

| Gate | Result |
|------|--------|
| `npm test` | **1335 passed** (138 files) |
| `npm run typecheck` | **Pass** |
| `npm run lint -- --max-warnings=0` | **Pass** |
| `npm run build` | **Pass** (1535 static pages) |
| Browser smoke | `/docs/ctix`, `/agent`, `/settings` redirect verified |
| Playwright e2e | **Not run** |

---

## 8. Scoring table

| Persona | Task | Product | Score | Failure/Confusion | Fix | Evidence |
|---------|------|---------|-------|-------------------|-----|----------|
| P1 | Open product docs | CSAP | 5 | Was 500 before fix | extractMarkdownHeadings | /docs/csap/... loads |
| P1 | Understand endpoint | CTIX | 4 | CQL jargon inherent | N/A (API domain) | list-threat-data page |
| P2 | View-only snippets | CTIX | 5 | Clear view-only message | Pre-existing CodeBlock | documentation-ui-security.test |
| P3 | Connect credentials | All | 5 | Clear memory-only copy | Pre-existing | /authentication |
| P3 | Ask AI | CTIX | 5 | Was DEVELOPER_ACCESS_TOKEN error | guard-api + user-facing-errors | /agent preview message |
| P4 | Manage users | — | 4 | Was jargon + 404 /settings | settings redirect + copy | /settings/users |
| P5 | Query analytics | — | 4 | Some internal metric labels | Pre-existing admin copy | query-analytics page |
| P6 | Find Ask AI mobile | CTIX | 4→5 | Was hidden in header | MobileDrawerWorkspaceLinks | drawer workspace nav |
| P6 | Toggle nav drawer | CFTR | 5 | — | Pre-existing | 390px toggle test |
| All | Product identity | 4 products | 5 | — | Product selector + badges | home + docs |

**Release target:** no critical task below 4 — **met** after F-001/F-002/F-007–F-011 fixes.

---

## 9. Remaining limitations

1. No production multi-domain canary (CFTR/CSAP/Orchestrate separate hostnames).
2. Legacy `/docs/[...slug]` CTIX path without full docs chrome.
3. Orchestrate ingested content garble (F-003).
4. Full keyboard-only walkthrough not completed.
5. Viewer role browser walkthrough with `viewer_ask_ai_access_enabled` off/on not executed (covered by unit tests).
6. Playwright e2e not re-run locally.
7. Some deep admin forms may retain zinc utility classes.
8. F-013: intermittent doc crashes not reproduced this pass — monitor in CI.

---

## 10. Rollback

Revert commits touching `extract-markdown-headings.ts`, `DocsChrome.tsx`, `AppFrame.tsx`, and associated tests. No migrations or API contract changes.

---

## Readiness

**VERIFIED WITH DOCUMENTED USABILITY LIMITATIONS**

Local CTIX + all four product doc trees load; critical walkthrough blockers (Ask AI env leak, sign-in jargon, search dead-end, settings 404) fixed; quality gates green. Production multi-domain validation, legacy route parity, content cleanup (F-003), and full e2e/a11y passes remain.

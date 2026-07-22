# Enterprise UI Polish Report

**Date:** 2026-07-22  
**Branch:** `ui/structural-cyware-replica`  
**Prompt:** Composer 2.5 Enterprise UI Polisher / Visual QA  
**Local:** `http://127.0.0.1:3000` (`AUTH_DISABLED`, analytics/unanswered flags on)  
**References:** https://www.cyware.com/ · https://techdocs.cyware.com/index.html  
**CTIX canary:** https://apitest1.cyninjadev.com  

---

## Final readiness decision

```text
POLISHED WITH DOCUMENTED LIMITATIONS
```

Structural Cyware replica remains in place. High-impact contrast, token, and product-mark polish landed locally with green gates. Full role/feature/product/browser/canary/visual-regression matrices were **not** completed in this pass, so production-verified status is not claimed.

---

## 1. Structural-refactor verification

| Route | Old structure present? | Current structure | Verdict |
|-------|------------------------|-------------------|---------|
| AppFrame | No flat token-only header | `cx-app-shell`, header zones, product strip | PASS |
| `/` hub | No 2×2 generic SaaS grid | `cx-home-hub`, hero, 4-col product collection, footer | PASS |
| `/docs/*` | No single-column only | `cx-docs-reader` + left docs rail (+ TOC when headings exist) | PASS |
| `/agent` | No bordered chat card-only | `cx-ask-workspace` multi-region | PASS |
| `/sign-in` | No centered-only card | `cx-split-auth` | PASS (code + prior ledger) |
| `/admin` | No light generic admin | Dark `cx-admin-nav-rail` + work area | PASS |

Evidence: local screenshots `local-home-1024-light.png`, `local-docs-1440.png`, `local-admin-1440.png`; production canary hub still structural (pre-polish card initials).

---

## 2. Complete UI inventory (exercised)

| Surface | Exercised | Notes |
|---------|-----------|-------|
| Global header / product strip | Yes | Light + dark; desktop + 390 |
| Home hub | Yes | 1440 / 1024 / 390 |
| Docs reader | Yes | CTIX overview; overflow check |
| Search (hub + compact) | Spot | Present; overlay not fully keyboard-matrixed |
| API endpoint runner | Spot (prior) | Not re-run end-to-end this pass |
| Ask AI empty workspace | Yes | Empty + sample prompts |
| Feedback / Build App | No | Not exercised this pass |
| Auth / credentials | Code review only | Split auth retained |
| Guides / changelog / settings | Inventory only | Markers present in code |
| Admin overview | Yes | Dark rail contrast verified |
| Query analytics toolbar | Code polish | Tokenized controls |
| Unanswered / weekly | Inventory / prior | Markers present |
| Mobile drawer workspace | Prior + 390 header | Toggle nav present |

---

## 3–5. Token / typography / spacing changes

| Change | Detail |
|--------|--------|
| `--text-muted` (light) | `#8a8d95` → `#6b7080` (~AA small-text contrast) |
| `.cx-admin-shell` | Flex column (matches `AdminFrame`); removed unused conflicting grid |
| `.cx-admin-nav-rail[data-tone="inverse"]` | Explicit inverse color root |
| Ask AI chrome | Zinc/sky → semantic tokens on header/settings strip |
| Product marks | Two-letter initials (`CT`/`CS`/`OR`/`CF`) |

---

## 6–21. Route polish summaries

| Area | Result |
|------|--------|
| Header / nav | Structural zones intact; Ask AI header link remains permission-gated (`canAskAi`) while hub CTA is always linked — documented limitation |
| Home | Techdocs-like hero + product collection; distinct product marks |
| Docs | Reader + left rail; no horizontal overflow at 1440 |
| Search | Hub + compact present; full overlay keyboard matrix not re-run |
| API reference | Structural wrapper retained; runner not re-polished this pass |
| Ask AI | Workspace empty state OK; zinc header tokens fixed |
| Feedback / Build App | **Not exercised** |
| Auth / credentials | Split auth + credential workspace retained |
| Guides / changelog / settings | Structural markers; no new polish |
| Admin | **Inverse tone** on dark rail + exit nav (critical contrast fix) |
| Query analytics | Toolbar uses shared `inputClass` / button tokens |
| Unanswered / weekly | Workbench markers; no new visual polish |

---

## 22–23. Table / form / overlay / state / icon / motion

Shared token helpers used for analytics filters. No new table system or icon family migration. Reduced-motion rules already in `globals.css`. Large zinc residue remains in Agent/Build App/admin secondary pages — deferred.

---

## 24. Dark-mode results

| Surface | Result |
|---------|--------|
| Home (dark) | Readable hierarchy; product accents OK |
| Docs (dark) | Article + rail readable |
| Admin (dark page + inverse rail) | Rail text now explicit white/opacity (fixed) |
| Ask AI (dark) | Header strip tokenized |

---

## 25. Responsive results

| Viewport | Routes | Overflow | Notes |
|----------|--------|----------|-------|
| 1440 | home, docs, admin | No (docs measured) | Admin rail visible |
| 1024 | home light | Spot OK | 2×2 product grid |
| 768 | Not fully captured | — | Limitation |
| 390 | home | No | Hamburger + stacked Ask AI |

---

## 26. Accessibility results

| Check | Result |
|-------|--------|
| Skip links | Present (app + admin) |
| Focus ring global | Present in `globals.css` |
| Admin nav keyboard / landmarks | Nav + breadcrumb regions present |
| Full WCAG audit / SR | **Not run** |
| 200% zoom / reduced motion | Reduced-motion CSS present; zoom not matrixed |

---

## 27–28. Performance / cross-browser

Not measured (LCP/CLS/INP). Chromium-only via Cursor browser MCP. Firefox/WebKit **not** run.

---

## 29. Role, feature, and product consistency

| Matrix | Status |
|--------|--------|
| Roles (Viewer → Owner, disabled, invite) | **Not exercised** this pass |
| Feature flags matrix | Flags enabled locally for analytics/unanswered only |
| CTIX / CFTR / CSAP / Orchestrate UI | Local product switcher exercised; prod CTIX canary hub only |

---

## 30. Visual-regression results

No Playwright baselines captured. Manual screenshots only (refs + local + CTIX canary). Overlay-vs-rejected-baseline **not** automated.

---

## Defect log

| Route/Component | Issue | Root Cause | Fix | Before | After | Evidence |
|---|---|---|---|---:|---:|---|
| AdminSidebar / NavGroup | Dark navy rail used light-surface semantic text colors (poor contrast) | Child utilities overrode parent `[&_a]:text-white` hacks | Explicit `tone="inverse" \| "default"` on nav + exit links | Low-contrast grey/blue on navy | White / white-opacity on navy | `local-admin-1440.png` |
| AdminAppExitNav sidebar | Zinc/sky classes assumed light drawer | Shared sidebar variant on dark rail | Inverse tone path with white text | Sky-on-navy / zinc-on-navy | White workspace links | Code + admin screenshot |
| CxProductCard | All products showed “C” | `title.slice(0,1)` | `initial` prop + productId marks | Identical “C” marks | CT/CS/OR/CF | `local-home-1024-light.png` vs `prod-ctix-home.png` |
| globals `--text-muted` | ~3.2:1 on white | Too light muted token | `#6b7080` | Weak captions | Stronger muted | Token diff |
| QueryAnalytics toolbar | One-off sky/zinc controls | Not using shared tokens | `inputClass` / `buttonPrimaryClass` / `buttonSecondaryClass` | Inconsistent | Token-aligned | Diff |
| AgentChat header | Zinc/sky chrome | Legacy classes | Semantic CSS vars | Mixed | Tokenized | Diff |
| AdminFrame / `.cx-admin-shell` | CSS grid unused/conflicting with flex frame | Class not applied; grid vs flex mismatch | Apply `cx-admin-shell` flex styles | Dead CSS | Aligned | Diff |

---

## 31. Files changed

- `src/components/admin/layout/AdminSidebar.tsx`
- `src/components/admin/layout/AdminAppExitNav.tsx`
- `src/components/admin/layout/AdminFrame.tsx`
- `src/components/admin/pages/QueryAnalyticsPage.tsx`
- `src/components/AgentChat.tsx`
- `src/components/cx/index.tsx`
- `src/app/page.tsx`
- `src/app/globals.css`
- `src/lib/__tests__/structural-ui-replica.test.ts`
- `docs/enterprise/ui-rewrite/ENTERPRISE_UI_POLISH_REPORT.md`

---

## 32. Tests added

- Structural assertions: admin inverse tone, exit-nav inverse, product initials (`structural-ui-replica.test.ts`)

---

## 33. Before/after screenshots

Captured under Cursor screenshot store (session):

- Refs: `ref-cyware-com-home.png`, `ref-techdocs-hub.png`
- Local: `local-home-1440.png`, `local-home-1024-light.png`, `local-home-390.png`, `local-docs-1440.png`, `local-admin-1440.png`
- Prod canary: `prod-ctix-home.png` (still pre-initials polish)

---

## 34. Polish scores (honest)

Scale 1–5. Routes not deeply exercised capped.

| Route | Struct | Hier | Type | Space | Consistency | Interaction | Responsive | A11y | Perf | Enterprise | Overall |
|-------|-------:|-----:|-----:|------:|------------:|------------:|-----------:|-----:|-----:|-----------:|--------:|
| Global frame | 5 | 4 | 4 | 4 | 4 | 4 | 4 | 4 | 3 | 4 | **4.0** |
| Home hub | 5 | 4 | 4 | 4 | 4 | 4 | 4 | 4 | 3 | 4 | **4.1** |
| Docs reader | 5 | 4 | 4 | 4 | 4 | 4 | 4 | 4 | 3 | 4 | **4.0** |
| Ask AI | 4 | 4 | 4 | 3 | 3 | 4 | 3 | 3 | 3 | 4 | **3.6** |
| Admin | 5 | 4 | 4 | 4 | 4 | 4 | 3 | 4 | 3 | 4 | **4.0** |
| Analytics | 4 | 3 | 3 | 3 | 4 | 3 | 3 | 3 | 3 | 4 | **3.4** |
| Auth / Build App / Feedback | — | — | — | — | — | — | — | — | — | — | **N/E** |

Release targets (≥4.5 overall / no major &lt;4) **not met** because Ask AI/analytics still mid-3s and large surfaces unexercised.

---

## 35. Exact command results

| Command | Result |
|---------|--------|
| `npm test` | PASS — 141 files / 1352 tests |
| `npx tsc --noEmit` | PASS (exit 0) |
| `npm run lint` | PASS (exit 0) |
| `npm run build` | PASS (exit 0) |
| Full prompt gate suite (`npm ci`, coverage, e2e, security:scan, health:*) | **Not run** |

---

## 36–40. Canaries

| Canary | Status |
|--------|--------|
| Local | Exercised |
| CTIX production (`apitest1.cyninjadev.com`) | Hub smoke — structural replica live; **missing** local polish (product initials still “C”) |
| CFTR / CSAP / Orchestrate production | **Not exercised** this pass |
| Admin production | **Not exercised** this pass |

---

## 41. Remaining limitations

1. Full role × feature × product matrix not run.
2. Firefox / WebKit not tested.
3. Playwright visual regression baselines not created.
4. Feedback, Build App, credentials rotate/revoke, weekly analytics deep states not polished this pass.
5. Large residual zinc/tailwind one-offs in Agent / Build App / secondary admin pages.
6. Header Ask AI remains `canAskAi`-gated (hub CTA always visible) — intentional auth policy, but inconsistent discoverability when unauthenticated.
7. Production canaries not redeployed with this polish (by design — prefer user-triggered deploy).
8. Orchestrate content artifact (`"'}>`) remains content/ingest issue (prior finding F-003).
9. Prompt’s exhaustive quality gate script (coverage/e2e/security/health) not executed.

---

## 42. Rollback result

No production deploy performed. Rollback = revert commit / leave uncommitted polish unused. Production remains last structural deploy.

---

## 43. Final readiness decision (repeat)

```text
POLISHED WITH DOCUMENTED LIMITATIONS
```

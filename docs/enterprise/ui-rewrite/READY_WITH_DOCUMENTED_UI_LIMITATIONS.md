# READY WITH DOCUMENTED UI LIMITATIONS

**Status:** Ready for merge / local verification (prod canary not required for this UI-only wave).

**Gates (2026-07-21):**

| Gate | Result |
|------|--------|
| `npm test` | Pass (1322 tests) |
| `npm run typecheck` | Pass |
| `npm run lint -- --max-warnings=0` | Pass |

## What shipped

Enterprise Cyware visual system across docs + admin: semantic CSS tokens (cyware.com + techdocs), Geist on body, branded `AppFrame` / `AdminFrame`, real docs search, docs reader chrome, Ask AI / feedback polish, credential & access branding, admin denser tokens, Support Agent mock labeling, `enterprise_ui_v2` default ON.

## Documented UI limitations

1. **Home DocsSearch** is client-side against `/api/docs/search` (BM25 index). No full-page search results route yet; results appear in a dropdown.
2. **TOC** is markdown heading scrape (`##`/`###`) only — does not cover endpoint param sections.
3. **Prev/next** follows product slug order from content index, not editorial nav tree order.
4. **Legacy CTIX `/docs/[...slug]`** pages were not given the same breadcrumb/TOC treatment as `/docs/[product]/[...slug]` (product-prefixed routes are the primary path).
5. **Not every admin subpage** was individually restyled; shared tokens/chrome cover most density — some zinc leftovers may remain in deep forms.
6. **`enterprise_ui_v2`** is a feature-flag key defaulting ON; the new CSS is always loaded (flag is for admin visibility / future gating, not a dual theme switch).
7. **No production canary** in this pass — verify visually on a preview deploy before promoting.

## Security / behavior preserved

SecretKey handling, Viewer cannot Run, Ask AI permission gates, MFA/SSO, feedback/reCAPTCHA, migrations 010/011 — unchanged.

# Migration Ledger — Enterprise UI Rewrite

| Wave | Item | Status | Notes |
|------|------|--------|-------|
| A | REFERENCE_CAPTURE.md | Done | cyware.com + techdocs measured tokens |
| A | DESIGN_ANALYSIS.md | Done | Techdocs density, Frame naming, no mega-menu |
| A | APP_AUDIT.md | Done | Gaps vs target |
| A | globals.css semantic tokens | Done | Brand, product, surface, text, spacing, dark |
| A | Geist on body | Done | layout.tsx `font-sans` + CSS `--font-sans` |
| A | admin/ui/tokens.ts shared helpers | Done | CSS-var based; product accent helpers |
| A | src/components/ui thin wrappers | Done | Button, ThemeToggle, PageStates, re-exports |
| A | AppFrame rewrite | Done | Logo, identity, ThemeToggle, skip link, Ask AI gates |
| A | AdminFrame / AdminHeader / AdminSidebar | Done | Same tokens; denser chrome |
| B | Home product hub + DocsSearch | Done | POST `/api/docs/search`; removed hard `/docs/ctix` form |
| B | Docs breadcrumbs / TOC / prev-next | Done | Product doc pages |
| B | Prose tokens | Done | `.prose-cyware` |
| B | EndpointView / CodeBlock polish | Done | Visual only; Run/Viewer unchanged |
| C | Ask AI layout / emoji removal | Done | SVG empty + feedback icons |
| C | AgentFeedbackControl | Done | API unchanged |
| C | CredentialManager + sign-in + AccessPage | Done | Token surfaces |
| C | Settings polish | Done | Users + Content headings |
| D | Admin denser control plane | Done | Frame/sidebar/header/table/metric tokens |
| D | Query Analytics polish | Done | Spacing + test id; sensitive gates unchanged |
| D | Support Agent mock labeling | Done | Badge + PLACEHOLDER_NOTICE |
| E | Loading/empty/error/permission helpers | Done | PageStates + EmptyState test ids |
| E | `enterprise_ui_v2` feature key | Done | Default **ON** (visual system live) |
| E | Characterization tests | Done | `enterprise-ui-tokens.test.ts` + existing no-Shell |
| E | Gates | **Pass** | `npm test` 1322; typecheck; lint `--max-warnings=0` |

## Explicit non-changes

- No backend/API rewrites; migrations 010/011 untouched
- MFA/SSO, Viewer gates, feedback/reCAPTCHA behavior preserved
- SecretKey remains password field / memory-only session rules unchanged
- No marketing clone, asset scraping, or `dangerouslySetInnerHTML` for design

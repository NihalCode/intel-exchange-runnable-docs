# Migration Ledger — Enterprise UI Rewrite

| Wave | Item | Status | Notes |
|------|------|--------|-------|
| A–E | Token polish (prior) | **Superseded** | Cosmetic baseline rejected by structural corrective prompt |
| S0 | Branch + baseline + STRUCTURAL_REPLACEMENT_LEDGER | Done | `ui/structural-cyware-replica` |
| S1 | cx primitives + AppFrame/AdminFrame geometry | Done | `data-layout` shells |
| S2 | Home / search / docs reader / API chrome | Done | Hub hero, overlay search, TOC rail |
| S3 | Ask AI / Build App / auth / guides | Done | Workspace + split sign-in |
| S4 | Admin analytics workbenches | Done | Dark nav rail + workbench markers |
| S5 | Characterization tests | Done | `structural-ui-replica.test.ts` |
| S6 | Report | Done | `READY_STRUCTURAL_REPLICA.md` — limitations include no prod canary |

## Explicit non-changes

- No backend/API rewrites; migrations 010/011 untouched
- MFA/SSO, Viewer gates, feedback/reCAPTCHA behavior preserved
- SecretKey remains password field / memory-only session rules unchanged
- No unauthorized asset scraping
- Production canaries deferred until explicit approval

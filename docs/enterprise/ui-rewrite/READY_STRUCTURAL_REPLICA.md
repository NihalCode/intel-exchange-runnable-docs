# READY WITH DOCUMENTED UI LIMITATIONS

**Structural Cyware replica rebuild** (corrective) — 2026-07-21  
Branch: `ui/structural-cyware-replica`

```text
READY WITH DOCUMENTED UI LIMITATIONS
```

## What changed (structural, not cosmetic)

| Area | Evidence |
|------|----------|
| Global frame | `data-layout="cx-app-shell"` — header zones, product strip, docs-only left rail, mobile full drawer |
| Home | `cx-hub-hero` + 4-column `CxProductCard` collection + enterprise `CxFooter` |
| Search | Hub / compact variants + overlay + Ask AI escalation |
| Docs reader | `cx-docs-reader` with right TOC rail (`cx-toc-rail`) |
| Ask AI | `cx-ask-workspace` grid (nav \| canvas \| sources) |
| Build App | `cx-build-app-panel` |
| Sign-in | `cx-split-auth` brand + form |
| Admin | Dark `cx-admin-nav-rail` + workbench analytics layouts |
| Primitives | `src/components/cx/*` |

## Freezes preserved

SecretKey memory-only, Viewer Run gates, Ask AI permissions, MFA/SSO, Query Analytics / feedback / reCAPTCHA contracts, no Shell naming.

## Documented limitations

1. **No production canaries** — local/branch only; do not flip product aliases until approved.
2. **Visual regression PNGs** — baseline protocol documented under `baseline-rejected/`; full multi-viewport screenshot capture/overlays not archived in-repo this session.
3. **Techdocs Inter / purple CTA** — app keeps Geist + brand blue; deliberate adaptation.
4. **Legacy `/docs/[...slug]`** — may still lack full product docs chrome.
5. **Admin deep forms** — some nested admin pages still carry older zinc utility classes.
6. **Playwright e2e visual suite** — not expanded to overlay geometry assertions yet.
7. **Orchestrate content garble** — ingest artifact (F-003) unchanged.

## Gates

| Gate | Result |
|------|--------|
| `npm test` | Pass (1344) |
| `npx tsc --noEmit` | Pass |
| `npm run lint -- --max-warnings=0` | Pass |
| `npm run build` | Pass |

Characterization: `src/lib/__tests__/structural-ui-replica.test.ts`

## Ledgers

- [STRUCTURAL_REPLACEMENT_LEDGER.md](./STRUCTURAL_REPLACEMENT_LEDGER.md)
- [STRUCTURAL_MIGRATION_STATUS.md](./STRUCTURAL_MIGRATION_STATUS.md)
- [REFERENCE_CAPTURE.md](./REFERENCE_CAPTURE.md) (structural geometry section)
- [baseline-rejected/README.md](./baseline-rejected/README.md)

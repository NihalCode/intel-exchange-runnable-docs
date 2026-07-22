# Rejected cosmetic baseline

**Branch:** `ui/structural-cyware-replica`  
**Captured:** 2026-07-21 (session start of structural rebuild)

This directory documents the **rejected** enterprise UI state: prior Waves A–E token polish plus usability follow-ups. Geometry retains the pre-rewrite application skeleton (flat header nav, 2×2 product cards, single article column, bordered Ask AI card stack, admin sidebar/card grid).

## Routes to compare (before structural rewrite)

| Route | Old geometry summary |
|-------|----------------------|
| `/` | Centered/left hero blurb + `DocsSearch` + 2×2 product cards + 3 resource cards |
| `/docs/{product}/…` | Sticky header + left sidebar (lg+) + single main column; no right TOC rail |
| `/agent` | Card-bordered chat canvas with side panels |
| `/authentication` | Centered credential forms |
| `/sign-in` | Centered auth card |
| `/admin` | Left sidebar + header + metric/card grid |
| `/settings/users` | Settings panel in AppFrame |

## Screenshot protocol

Store viewport captures under `artifacts/ui-structural/baseline/` when generated:

- 1600×1000, 1440×1000, 1280×900, 1024×768, 768×1024, 430×932, 390×844, 360×800

Name: `{route-slug}__{viewport}.png` (e.g. `home__1440x1000.png`).

Overlay comparisons after rewrite must show **materially different** DOM geometry (not color-only diffs).

## Disposition

See [STRUCTURAL_REPLACEMENT_LEDGER.md](../STRUCTURAL_REPLACEMENT_LEDGER.md).
